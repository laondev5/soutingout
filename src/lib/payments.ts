import mongoose from "mongoose"
import {
  AccommodationModel,
  BookingModel,
  DelegateModel,
  PaymentModel,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { trySendEmail } from "@/lib/email"
import { paymentConfirmedEmail, paymentFailedEmail } from "@/lib/email-templates"
import { identifiersFor, nextDelegateNumber } from "@/lib/lff-id"
import { logActivity } from "@/lib/activity-log"
import { MAX_PAYMENT_ATTEMPTS, PAYMENT_RETRY_SCHEDULE_MINUTES } from "@/lib/constants"

export type ConfirmResult =
  | { ok: true; alreadyConfirmed: boolean; lffId: string | null; accommodationCode: string | null }
  | { ok: false; reason: "payment_not_found" | "delegate_not_found" }

/**
 * The single place a payment becomes confirmed. Both the Paystack webhook and
 * the reconciliation cron call this, and either may arrive first — so the
 * status flip is an atomic conditional update and everything after it is
 * guarded. Calling this twice for one reference is a no-op the second time.
 */
export async function confirmPayment(input: {
  reference: string
  verifiedByUserId?: string | null
  rawResponse?: Record<string, unknown> | null
}): Promise<ConfirmResult> {
  await connectDB()

  // Only one caller can win this transition; a late duplicate matches nothing.
  const payment = await PaymentModel.findOneAndUpdate(
    { reference: input.reference, status: { $ne: "confirmed" } },
    {
      $set: {
        status: "confirmed",
        verifiedAt: new Date(),
        verifiedByUserId: input.verifiedByUserId ?? null,
        rawResponse: input.rawResponse ?? null,
        nextRetryAt: null,
        lastError: null,
      },
    },
    { returnDocument: "after" }
  )

  if (!payment) {
    const existing = await PaymentModel.findOne({ reference: input.reference })
    if (!existing) {
      return { ok: false, reason: "payment_not_found" }
    }

    // Already confirmed by the other path — report the delegate's identifiers.
    const delegate = await DelegateModel.findById(existing.delegateId).select(
      "lffId accommodationCode"
    )
    return {
      ok: true,
      alreadyConfirmed: true,
      lffId: delegate?.lffId ?? null,
      accommodationCode: delegate?.accommodationCode ?? null,
    }
  }

  const delegate = await DelegateModel.findById(payment.delegateId)
  if (!delegate) {
    return { ok: false, reason: "delegate_not_found" }
  }

  await DelegateModel.updateOne(
    { _id: delegate._id },
    { $inc: { totalPaid: payment.amount } }
  )

  const accommodation = delegate.accommodationId
    ? await AccommodationModel.findById(delegate.accommodationId)
    : null

  const identifiers = await mintIdentifiers({
    delegateId: delegate._id,
    codePrefix: accommodation?.codePrefix ?? "GEN",
  })

  await confirmBookingFor(delegate._id)

  await DelegateModel.updateOne(
    { _id: delegate._id, registrationStatus: "pending" },
    { $set: { registrationStatus: "confirmed", confirmedAt: new Date() } }
  )

  const fresh = await DelegateModel.findById(delegate._id).select(
    "fullName email lffId accommodationCode totalDue totalPaid"
  )

  await logActivity({
    actorUserId: input.verifiedByUserId ?? null,
    action: "payment.confirmed",
    entityType: "payment",
    entityId: String(payment._id),
    details: {
      reference: payment.reference,
      provider: payment.provider,
      amount: payment.amount,
      delegateId: String(delegate._id),
      lffId: fresh?.lffId ?? null,
    },
  })

  if (fresh?.email) {
    const balance = Math.max(0, (fresh.totalDue ?? 0) - (fresh.totalPaid ?? 0))
    const message = paymentConfirmedEmail({
      fullName: fresh.fullName,
      lffId: fresh.lffId ?? identifiers.lffId,
      accommodationCode: fresh.accommodationCode ?? identifiers.accommodationCode,
      accommodationName: accommodation?.name ?? "To be allocated",
      amountPaid: payment.amount,
      balance,
    })
    await trySendEmail({ to: fresh.email, ...message })
  }

  return {
    ok: true,
    alreadyConfirmed: false,
    lffId: fresh?.lffId ?? identifiers.lffId,
    accommodationCode: fresh?.accommodationCode ?? identifiers.accommodationCode,
  }
}

/**
 * Claim a delegate number and write both identifiers, but only if this
 * delegate has none. Two racing confirmations may each claim a number; the
 * loser's is simply discarded, which leaves a gap in the sequence but never a
 * duplicate or a reassigned id.
 */
async function mintIdentifiers(input: {
  delegateId: mongoose.Types.ObjectId
  codePrefix: string
}) {
  const existing = await DelegateModel.findById(input.delegateId).select(
    "delegateNumber lffId accommodationCode"
  )

  if (existing?.delegateNumber && existing.lffId && existing.accommodationCode) {
    return { lffId: existing.lffId, accommodationCode: existing.accommodationCode }
  }

  const delegateNumber = await nextDelegateNumber()
  const identifiers = identifiersFor({ delegateNumber, codePrefix: input.codePrefix })

  await DelegateModel.updateOne(
    { _id: input.delegateId, delegateNumber: null },
    { $set: { delegateNumber, ...identifiers } }
  )

  const after = await DelegateModel.findById(input.delegateId).select("lffId accommodationCode")

  return {
    lffId: after?.lffId ?? identifiers.lffId,
    accommodationCode: after?.accommodationCode ?? identifiers.accommodationCode,
  }
}

/** Flip a held booking to confirmed and take the beds — once. */
async function confirmBookingFor(delegateId: mongoose.Types.ObjectId) {
  const booking = await BookingModel.findOneAndUpdate(
    { delegateId, status: "held" },
    { $set: { status: "confirmed" } },
    { returnDocument: "after" }
  )

  if (!booking) return

  await AccommodationModel.updateOne(
    { _id: booking.accommodationId },
    { $inc: { bedsReserved: booking.beds } }
  )
}

/**
 * Reissue the accommodation code after a delegate is moved to a different
 * accommodation. The LFF ID is deliberately untouched — it identifies the
 * person for the whole retreat, not their lodging.
 */
export async function reissueAccommodationCode(input: {
  delegateId: string | mongoose.Types.ObjectId
  actorUserId?: string | null
}) {
  await connectDB()

  const delegate = await DelegateModel.findById(input.delegateId)
  if (!delegate?.delegateNumber || !delegate.accommodationId) {
    return { reissued: false as const }
  }

  const accommodation = await AccommodationModel.findById(delegate.accommodationId).select(
    "codePrefix name"
  )
  if (!accommodation) {
    return { reissued: false as const }
  }

  const { accommodationCode } = identifiersFor({
    delegateNumber: delegate.delegateNumber,
    codePrefix: accommodation.codePrefix,
  })

  if (accommodationCode === delegate.accommodationCode) {
    return { reissued: false as const }
  }

  const previous = delegate.accommodationCode
  delegate.accommodationCode = accommodationCode
  await delegate.save()

  await logActivity({
    actorUserId: input.actorUserId ?? null,
    action: "delegate.accommodation_code_reissued",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: { from: previous, to: accommodationCode, accommodation: accommodation.name },
  })

  return { reissued: true as const, accommodationCode, previous }
}

// ── Reconciliation ───────────────────────────────────────────────────

export function nextRetryDelayMinutes(attempts: number) {
  const index = Math.min(attempts, PAYMENT_RETRY_SCHEDULE_MINUTES.length - 1)
  return PAYMENT_RETRY_SCHEDULE_MINUTES[index]
}

export function scheduleRetry(attempts: number) {
  return new Date(Date.now() + nextRetryDelayMinutes(attempts) * 60_000)
}

/**
 * Atomically claim one due payment for reconciliation. Bumping `attempts` and
 * pushing `nextRetryAt` forward inside the same update means an overlapping
 * cron run cannot pick up the same row.
 */
export async function claimPaymentForReconciliation() {
  await connectDB()

  return PaymentModel.findOneAndUpdate(
    {
      provider: "paystack",
      status: "pending",
      attempts: { $lt: MAX_PAYMENT_ATTEMPTS },
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date() } }],
    },
    [
      {
        $set: {
          attempts: { $add: ["$attempts", 1] },
          nextRetryAt: {
            $add: [new Date(), 1000 * 60 * 5],
          },
        },
      },
    ],
    { returnDocument: "after", sort: { nextRetryAt: 1, createdAt: 1 } }
  )
}

export async function markPaymentFailed(input: {
  reference: string
  error: string
  notify?: boolean
}) {
  await connectDB()

  const payment = await PaymentModel.findOneAndUpdate(
    { reference: input.reference, status: { $ne: "confirmed" } },
    { $set: { status: "failed", lastError: input.error, nextRetryAt: null } },
    { returnDocument: "after" }
  )

  if (!payment) return { marked: false as const }

  await logActivity({
    action: "payment.failed",
    entityType: "payment",
    entityId: String(payment._id),
    details: { reference: payment.reference, error: input.error },
  })

  if (input.notify !== false) {
    const delegate = await DelegateModel.findById(payment.delegateId).select("fullName email")
    if (delegate?.email) {
      const message = paymentFailedEmail({
        fullName: delegate.fullName,
        amount: payment.amount,
        reference: payment.reference,
      })
      await trySendEmail({ to: delegate.email, ...message })
    }
  }

  return { marked: true as const }
}
