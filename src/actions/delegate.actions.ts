"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import {
  AccommodationModel,
  BookingModel,
  DelegateModel,
  PastoralSessionModel,
  PaymentModel,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, canAccessDelegate, requireUser } from "@/lib/permissions"
import { assignDelegate, type AssignableRole } from "@/lib/assignment"
import { confirmPayment, reissueAccommodationCode } from "@/lib/payments"
import { bedsAvailableFor } from "@/lib/accommodation"
import { quote } from "@/lib/pricing"
import { generateReference } from "@/lib/paystack"
import { logActivity } from "@/lib/activity-log"
import type { AdditionalServiceId, PastoralStatus } from "@/lib/constants"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const NOT_FOUND = "That delegate could not be found."

/** Load a delegate the caller is allowed to touch, or explain why not. */
async function loadInScope(delegateId: string) {
  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(delegateId)) {
    return { ok: false as const, error: NOT_FOUND }
  }

  const user = await requireUser()
  const delegate = await DelegateModel.findById(delegateId)

  // Out of scope and non-existent are reported identically, so an id outside
  // the caller's scope does not leak the fact that it exists.
  if (!delegate || !canAccessDelegate(user, delegate)) {
    return { ok: false as const, error: NOT_FOUND }
  }

  return { ok: true as const, user, delegate }
}

// ── Assignment ───────────────────────────────────────────────────────

export async function reassignDelegate(input: {
  delegateId: string
  role: AssignableRole
  toUserId: string
  reason?: string
}): Promise<ActionResult> {
  const user = await requireUser()

  if (!can(user, "delegates.assign")) {
    return { ok: false, error: "You do not have permission to reassign delegates." }
  }

  const result = await assignDelegate({
    delegateId: input.delegateId,
    role: input.role,
    toUserId: input.toUserId,
    reason: input.reason,
    actorUserId: user.id,
  })

  if (!result.assigned) {
    const messages = {
      delegate_not_found: "That delegate could not be found.",
      no_available_assignee: "There is no active staff member available to take this delegate.",
      already_assigned: "That delegate is already assigned to this person.",
    }
    return { ok: false, error: messages[result.reason] }
  }

  revalidatePath(`/dashboard/delegates/${input.delegateId}`)
  revalidatePath("/dashboard/delegates")
  return { ok: true }
}

// ── Payments ─────────────────────────────────────────────────────────

/**
 * A sub-admin logging a transfer they have seen proof of. This both records
 * the payment and confirms it in one step, which is what "mark as paid" means
 * operationally — so it mints the delegate's identifiers.
 */
export async function recordManualPayment(input: {
  delegateId: string
  amount: number
  note?: string
  receiptUrl?: string | null
  receiptPublicId?: string | null
}): Promise<ActionResult<{ lffId: string | null; accommodationCode: string | null }>> {
  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  const { user, delegate } = scoped

  if (!can(user, "payments.confirm")) {
    return { ok: false, error: "You do not have permission to confirm payments." }
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Enter the amount that was paid." }
  }

  const reference = generateReference("MAN")

  await PaymentModel.create({
    delegateId: delegate._id,
    provider: "manual",
    reference,
    amount: Math.round(input.amount),
    status: "submitted",
    note: input.note ?? "",
    receiptUrl: input.receiptUrl ?? null,
    receiptPublicId: input.receiptPublicId ?? null,
  })

  const result = await confirmPayment({ reference, verifiedByUserId: user.id })

  if (!result.ok) {
    return { ok: false, error: "The payment was recorded but could not be confirmed." }
  }

  revalidatePath(`/dashboard/delegates/${input.delegateId}`)
  revalidatePath("/dashboard/delegates")
  revalidatePath("/dashboard/payments")

  return { ok: true, lffId: result.lffId, accommodationCode: result.accommodationCode }
}

/** Confirm a payment the delegate already submitted proof for. */
export async function confirmSubmittedPayment(input: {
  paymentId: string
}): Promise<ActionResult> {
  const user = await requireUser()

  if (!can(user, "payments.confirm")) {
    return { ok: false, error: "You do not have permission to confirm payments." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.paymentId)) {
    return { ok: false, error: "That payment could not be found." }
  }

  const payment = await PaymentModel.findById(input.paymentId)
  if (!payment) {
    return { ok: false, error: "That payment could not be found." }
  }

  const delegate = await DelegateModel.findById(payment.delegateId)
  if (!delegate || !canAccessDelegate(user, delegate)) {
    return { ok: false, error: "That payment could not be found." }
  }

  const result = await confirmPayment({
    reference: payment.reference,
    verifiedByUserId: user.id,
  })

  if (!result.ok) {
    return { ok: false, error: "That payment could not be confirmed." }
  }

  revalidatePath(`/dashboard/delegates/${payment.delegateId}`)
  revalidatePath("/dashboard/payments")
  return { ok: true }
}

// ── Accommodation ────────────────────────────────────────────────────

/**
 * Move a delegate to a different accommodation. Reprices the registration,
 * moves the held or confirmed beds, and reissues the accommodation code — the
 * LFF ID stays put.
 */
export async function changeAccommodation(input: {
  delegateId: string
  accommodationId: string
}): Promise<ActionResult<{ accommodationCode?: string }>> {
  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  const { user, delegate } = scoped

  if (!can(user, "delegates.edit")) {
    return { ok: false, error: "You do not have permission to edit delegates." }
  }

  if (!mongoose.Types.ObjectId.isValid(input.accommodationId)) {
    return { ok: false, error: "Choose a valid accommodation." }
  }

  const accommodation = await AccommodationModel.findById(input.accommodationId)
  if (!accommodation) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  if (String(delegate.accommodationId) === String(accommodation._id)) {
    return { ok: false, error: "The delegate is already in that accommodation." }
  }

  const priced = quote({
    accommodation: {
      name: accommodation.name,
      pricePerPerson: accommodation.pricePerPerson,
      pricingMode: accommodation.pricingMode,
      capacityPerUnit: accommodation.capacityPerUnit,
      isFree: accommodation.isFree,
    },
    comingWith: delegate.comingWith,
    additionalServices: delegate.additionalServices as AdditionalServiceId[],
  })

  const available = await bedsAvailableFor(accommodation._id)
  if (available < priced.bedsRequired) {
    return {
      ok: false,
      error: `${accommodation.name} does not have room for ${priced.bedsRequired} more.`,
    }
  }

  const booking = await BookingModel.findOne({
    delegateId: delegate._id,
    status: { $in: ["held", "confirmed"] },
  })

  // Give the old beds back before taking the new ones.
  if (booking) {
    if (booking.status === "confirmed") {
      await AccommodationModel.updateOne(
        { _id: booking.accommodationId },
        { $inc: { bedsReserved: -booking.beds } }
      )
      await AccommodationModel.updateOne(
        { _id: accommodation._id },
        { $inc: { bedsReserved: priced.bedsRequired } }
      )
    }

    booking.accommodationId = accommodation._id
    booking.beds = priced.bedsRequired
    booking.unitPrice = accommodation.pricePerPerson
    booking.amount = priced.accommodationTotal
    await booking.save()
  }

  const previousAccommodationId = delegate.accommodationId
  delegate.accommodationId = accommodation._id
  delegate.totalDue = priced.total
  await delegate.save()

  const reissued = await reissueAccommodationCode({
    delegateId: delegate._id,
    actorUserId: user.id,
  })

  await logActivity({
    actorUserId: user.id,
    action: "delegate.accommodation_changed",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: {
      from: previousAccommodationId ? String(previousAccommodationId) : null,
      to: String(accommodation._id),
      newTotalDue: priced.total,
    },
  })

  revalidatePath(`/dashboard/delegates/${input.delegateId}`)
  revalidatePath("/dashboard/accommodations")

  return {
    ok: true,
    accommodationCode: reissued.reissued ? reissued.accommodationCode : undefined,
  }
}

// ── Status ───────────────────────────────────────────────────────────

export async function cancelRegistration(input: {
  delegateId: string
  reason?: string
}): Promise<ActionResult> {
  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  const { user, delegate } = scoped

  if (!can(user, "delegates.edit")) {
    return { ok: false, error: "You do not have permission to edit delegates." }
  }

  // Release the beds so the space goes back on sale immediately.
  const booking = await BookingModel.findOne({
    delegateId: delegate._id,
    status: { $in: ["held", "confirmed"] },
  })

  if (booking) {
    if (booking.status === "confirmed") {
      await AccommodationModel.updateOne(
        { _id: booking.accommodationId },
        { $inc: { bedsReserved: -booking.beds } }
      )
    }
    booking.status = "released"
    await booking.save()
  }

  delegate.registrationStatus = "cancelled"
  await delegate.save()

  await logActivity({
    actorUserId: user.id,
    action: "delegate.cancelled",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: { reason: input.reason ?? "" },
  })

  revalidatePath(`/dashboard/delegates/${input.delegateId}`)
  revalidatePath("/dashboard/delegates")
  return { ok: true }
}

// ── Pastoral ─────────────────────────────────────────────────────────

export async function setPastoralStatus(input: {
  delegateId: string
  status: PastoralStatus
  notes?: string
}): Promise<ActionResult> {
  const user = await requireUser()

  if (user.role !== "pastor") {
    return { ok: false, error: "Only pastors can record a pastoral session." }
  }

  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  await PastoralSessionModel.updateOne(
    { delegateId: scoped.delegate._id, pastorId: new mongoose.Types.ObjectId(user.id) },
    {
      $set: {
        status: input.status,
        notes: input.notes ?? "",
        seenAt: input.status === "seen" ? new Date() : null,
      },
    },
    { upsert: true }
  )

  await logActivity({
    actorUserId: user.id,
    action: `pastoral.${input.status}`,
    entityType: "delegate",
    entityId: input.delegateId,
    details: { status: input.status },
  })

  revalidatePath(`/pastor/delegates/${input.delegateId}`)
  revalidatePath("/pastor")
  return { ok: true }
}
