"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import {
  AccommodationModel,
  BookingModel,
  DelegateModel,
  PastoralSessionModel,
  PaymentModel,
  type ICompanion,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, canAccessDelegate, requireUser } from "@/lib/permissions"
import { assignDelegate, type AssignableRole } from "@/lib/assignment"
import { confirmPayment, reissueAccommodationCode } from "@/lib/payments"
import { bedsAvailableFor } from "@/lib/accommodation"
import { quote } from "@/lib/pricing"
import { generateReference } from "@/lib/paystack"
import { logActivity } from "@/lib/activity-log"
import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  GENDERS,
  companionStepFor,
  familyMemberCount,
  type AdditionalServiceId,
  type ComingWith,
  type Gender,
  type PastoralStatus,
} from "@/lib/constants"

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

// ── Details ──────────────────────────────────────────────────────────

export type CompanionInput = {
  fullName: string
  phone?: string
  whatsapp?: string
  gender?: Gender | null
}

/** How many companions a "coming with" answer expects, and what to call them. */
function companionShapeFor(comingWith: ComingWith) {
  const step = companionStepFor(comingWith)

  if (step === "partner") {
    return {
      count: 1,
      kind: (comingWith === "My spouse" ? "spouse" : "friend_sibling") as ICompanion["kind"],
      label: comingWith === "My spouse" ? "your spouse" : "your friend or sibling",
    }
  }

  if (step === "family") {
    return {
      count: familyMemberCount(comingWith),
      kind: "family_member" as ICompanion["kind"],
      label: "family member",
    }
  }

  return { count: 0, kind: "family_member" as ICompanion["kind"], label: "" }
}

/**
 * Edit a delegate's own details.
 *
 * Only the fields present in `input` are touched, so the same action serves a
 * one-word typo fix and a full rewrite. Two of those fields move money:
 * `comingWith` changes the party size and `additionalServices` changes the
 * extras, so either one re-runs the quote, re-checks the beds and rewrites the
 * booking — the same path `changeAccommodation` takes. What is already paid is
 * never touched; the balance simply moves.
 */
export async function updateDelegate(input: {
  delegateId: string
  fullName?: string
  email?: string
  phoneNumber?: string
  whatsappNumber?: string
  gender?: Gender | null
  comingWith?: ComingWith
  companions?: CompanionInput[]
  comments?: string
  additionalServices?: AdditionalServiceId[]
}): Promise<ActionResult<{ totalDue: number }>> {
  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  const { user, delegate } = scoped

  if (!can(user, "delegates.edit")) {
    return { ok: false, error: "You do not have permission to edit delegates." }
  }

  if (delegate.registrationStatus === "cancelled") {
    return { ok: false, error: "This registration is cancelled and can no longer be edited." }
  }

  const changed: Record<string, unknown> = {}

  // ── Plain fields ───────────────────────────────────────────────────

  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim()
    if (!fullName) return { ok: false, error: "Enter the delegate's full name." }
    if (fullName !== delegate.fullName) changed.fullName = fullName
    delegate.fullName = fullName
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." }
    }
    // The status page looks a delegate up by LFF ID and email, so a duplicate
    // would make two registrations answer to the same lookup.
    if (email !== delegate.email) {
      const clash = await DelegateModel.exists({
        email,
        _id: { $ne: delegate._id },
        registrationStatus: { $ne: "cancelled" },
      })
      if (clash) {
        return { ok: false, error: "Another delegate is registered with that email address." }
      }
      changed.email = email
      delegate.email = email
    }
  }

  if (input.phoneNumber !== undefined) {
    const phoneNumber = input.phoneNumber.trim()
    if (!phoneNumber) return { ok: false, error: "Enter a phone number." }
    if (phoneNumber !== delegate.phoneNumber) changed.phoneNumber = phoneNumber
    delegate.phoneNumber = phoneNumber
  }

  if (input.whatsappNumber !== undefined) {
    const whatsappNumber = input.whatsappNumber.trim()
    if (!whatsappNumber) return { ok: false, error: "Enter a WhatsApp number." }
    if (whatsappNumber !== delegate.whatsappNumber) changed.whatsappNumber = whatsappNumber
    delegate.whatsappNumber = whatsappNumber
  }

  if (input.gender !== undefined) {
    if (input.gender && !(GENDERS as readonly string[]).includes(input.gender)) {
      return { ok: false, error: "Choose a valid gender." }
    }
    if (input.gender !== (delegate.gender ?? null)) changed.gender = input.gender
    delegate.gender = input.gender ?? undefined
  }

  if (input.comments !== undefined) {
    const comments = input.comments.trim()
    if (comments !== delegate.comments) changed.comments = comments
    delegate.comments = comments
  }

  // ── Party and services (these reprice) ─────────────────────────────

  const previousComingWith = delegate.comingWith

  if (input.comingWith !== undefined) {
    if (!(COMING_WITH_OPTIONS as readonly string[]).includes(input.comingWith)) {
      return { ok: false, error: "Choose a valid answer for who they are coming with." }
    }
    if (input.comingWith !== delegate.comingWith) changed.comingWith = input.comingWith
    delegate.comingWith = input.comingWith
  }

  if (input.additionalServices !== undefined) {
    const allowed = ADDITIONAL_SERVICES.map((service) => service.id) as readonly string[]
    const services = [...new Set(input.additionalServices)].filter((id) => allowed.includes(id))
    if (services.join(",") !== [...delegate.additionalServices].join(",")) {
      changed.additionalServices = services
    }
    delegate.additionalServices = services
  }

  if (input.companions !== undefined) {
    const shape = companionShapeFor(delegate.comingWith)

    const named = input.companions
      .map((companion) => ({
        kind: shape.kind,
        fullName: (companion.fullName ?? "").trim(),
        phone: (companion.phone ?? "").trim(),
        whatsapp: (companion.whatsapp ?? "").trim(),
        gender: companion.gender ?? undefined,
      }))
      .slice(0, shape.count)
      .filter((companion) => companion.fullName.length > 0)

    // Only insist on complete names when the answer itself changed. An older
    // record imported from the Sheet may have none, and blocking a typo fix on
    // the email address because of that would be perverse.
    if (changed.comingWith && named.length < shape.count) {
      return {
        ok: false,
        error:
          shape.count === 1
            ? `Enter the name of ${shape.label}.`
            : `Enter the names of all ${shape.count} family members.`,
      }
    }

    // The form posts the companion rows on every save, so compare before
    // marking a change — otherwise a no-op edit still writes an audit entry.
    const before = delegate.companions.map(
      (c) => `${c.fullName}|${c.phone ?? ""}|${c.whatsapp ?? ""}|${c.gender ?? ""}`
    )
    const after = named.map(
      (c) => `${c.fullName}|${c.phone}|${c.whatsapp}|${c.gender ?? ""}`
    )

    if (before.join("~") !== after.join("~")) {
      changed.companions = named.length
      delegate.companions = named
    }
  }

  // ── Reprice ────────────────────────────────────────────────────────

  const repriced = Boolean(changed.comingWith) || Boolean(changed.additionalServices)

  if (repriced) {
    const accommodation = delegate.accommodationId
      ? await AccommodationModel.findById(delegate.accommodationId)
      : null

    const priced = quote({
      accommodation: accommodation
        ? {
            name: accommodation.name,
            pricePerPerson: accommodation.pricePerPerson,
            pricingMode: accommodation.pricingMode,
            capacityPerUnit: accommodation.capacityPerUnit,
            isFree: accommodation.isFree,
          }
        : null,
      comingWith: delegate.comingWith,
      additionalServices: delegate.additionalServices as AdditionalServiceId[],
    })

    const booking = await BookingModel.findOne({
      delegateId: delegate._id,
      status: { $in: ["held", "confirmed"] },
    })

    if (accommodation && booking && priced.bedsRequired !== booking.beds) {
      const extra = priced.bedsRequired - booking.beds

      if (extra > 0) {
        // This delegate's own beds are already counted as taken, so the room
        // to check for is only the difference.
        const available = await bedsAvailableFor(accommodation._id)
        if (available < extra) {
          return {
            ok: false,
            error: `${accommodation.name} only has ${available} bed${available === 1 ? "" : "s"} left — not enough for a party of ${priced.partySize}.`,
          }
        }
      }

      // Held bookings are not in `bedsReserved` yet, so only a confirmed one
      // moves the counter.
      if (booking.status === "confirmed") {
        await AccommodationModel.updateOne(
          { _id: accommodation._id },
          { $inc: { bedsReserved: extra } }
        )
      }

      booking.beds = priced.bedsRequired
    }

    if (booking) {
      booking.unitPrice = accommodation?.pricePerPerson ?? 0
      booking.amount = priced.accommodationTotal
      await booking.save()
    }

    if (priced.total !== delegate.totalDue) changed.totalDue = priced.total
    delegate.totalDue = priced.total
  }

  if (Object.keys(changed).length === 0) {
    return { ok: true, totalDue: delegate.totalDue ?? 0 }
  }

  await delegate.save()

  await logActivity({
    actorUserId: user.id,
    action: "delegate.updated",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: {
      changed,
      ...(changed.comingWith ? { previousComingWith } : {}),
    },
  })

  revalidatePath(`/dashboard/delegates/${input.delegateId}`)
  revalidatePath("/dashboard/delegates")
  if (repriced) revalidatePath("/dashboard/accommodations")

  return { ok: true, totalDue: delegate.totalDue ?? 0 }
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

/**
 * Remove a delegate for good.
 *
 * Unlike cancelling, which keeps the record and simply stops holding a bed,
 * this erases the registration — for a duplicate, a test row, or a mistaken
 * import. Their beds go back on sale and the rows that only exist to describe
 * them (bookings, payments, pastoral sessions) go with them.
 *
 * The activity log keeps its entry, including the name and LFF ID, so a
 * deletion is still answerable for afterwards.
 */
export async function deleteDelegate(input: {
  delegateId: string
}): Promise<ActionResult<{ fullName: string }>> {
  const scoped = await loadInScope(input.delegateId)
  if (!scoped.ok) return { ok: false, error: scoped.error }

  const { user, delegate } = scoped

  // Deliberately stricter than editing: a sub-admin can correct a delegate but
  // only a super admin can make one disappear.
  if (user.role !== "super_admin") {
    return { ok: false, error: "Only a super admin can delete a delegate." }
  }

  const booking = await BookingModel.findOne({
    delegateId: delegate._id,
    status: { $in: ["held", "confirmed"] },
  })

  // Only a confirmed booking is counted in `bedsReserved`; a held one was
  // never added to it.
  if (booking?.status === "confirmed") {
    await AccommodationModel.updateOne(
      { _id: booking.accommodationId },
      { $inc: { bedsReserved: -booking.beds } }
    )
  }

  const [payments, sessions, bookings] = await Promise.all([
    PaymentModel.deleteMany({ delegateId: delegate._id }),
    PastoralSessionModel.deleteMany({ delegateId: delegate._id }),
    BookingModel.deleteMany({ delegateId: delegate._id }),
  ])

  const fullName = delegate.fullName

  await DelegateModel.deleteOne({ _id: delegate._id })

  await logActivity({
    actorUserId: user.id,
    action: "delegate.deleted",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: {
      fullName,
      email: delegate.email,
      lffId: delegate.lffId,
      totalPaid: delegate.totalPaid ?? 0,
      removed: {
        payments: payments.deletedCount,
        pastoralSessions: sessions.deletedCount,
        bookings: bookings.deletedCount,
      },
    },
  })

  revalidatePath("/dashboard/delegates")
  revalidatePath("/dashboard/payments")
  revalidatePath("/dashboard/accommodations")

  return { ok: true, fullName }
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
