"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { AccommodationModel, DelegateModel, PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { generateReference } from "@/lib/paystack"
import { generateStatusToken } from "@/lib/status-token"
import { logActivity } from "@/lib/activity-log"
import { formatNaira } from "@/lib/constants"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export type DelegateStatus = {
  id: string
  fullName: string
  email: string
  registrationStatus: string
  lffId: string | null
  accommodationCode: string | null
  accommodationName: string | null
  totalDue: number
  totalPaid: number
  balance: number
  hasPendingReceipt: boolean
  /** This delegate's own `/status/<token>` link. */
  statusToken: string
}

const NOT_FOUND =
  "We could not find a registration with that email. Check the address you registered with."

type DelegateDoc = {
  _id: mongoose.Types.ObjectId
  fullName: string
  email: string
  registrationStatus: string
  lffId?: string | null
  accommodationCode?: string | null
  accommodationId?: mongoose.Types.ObjectId | null
  totalDue?: number
  totalPaid?: number
  statusToken?: string | null
}

/**
 * Turn a Delegate document into the shape the status page renders.
 *
 * Every delegate is meant to carry a `statusToken`, but records written
 * before that field existed may not have one yet — this mints and saves one
 * on the spot rather than leaving the profile link broken.
 */
async function toDelegateStatus(delegate: DelegateDoc): Promise<DelegateStatus> {
  let statusToken = delegate.statusToken

  if (!statusToken) {
    statusToken = generateStatusToken()
    await DelegateModel.updateOne({ _id: delegate._id }, { $set: { statusToken } })
  }

  const [accommodation, pendingReceipt] = await Promise.all([
    delegate.accommodationId
      ? AccommodationModel.findById(delegate.accommodationId).select("name").lean()
      : null,
    PaymentModel.countDocuments({ delegateId: delegate._id, status: "submitted" }),
  ])

  return {
    id: String(delegate._id),
    fullName: delegate.fullName,
    email: delegate.email,
    registrationStatus: delegate.registrationStatus,
    lffId: delegate.lffId ?? null,
    accommodationCode: delegate.accommodationCode ?? null,
    accommodationName: accommodation?.name ?? null,
    totalDue: delegate.totalDue ?? 0,
    totalPaid: delegate.totalPaid ?? 0,
    balance: Math.max(0, (delegate.totalDue ?? 0) - (delegate.totalPaid ?? 0)),
    hasPendingReceipt: pendingReceipt > 0,
    statusToken,
  }
}

/**
 * Delegates have no password. Since one email can now cover more than one
 * registration — a parent registering several family members, say — email
 * alone only narrows the search; a full name (or an LFF ID, once issued) is
 * what actually picks one out. Everyone who registers is also emailed a
 * direct `/status/<token>` link that skips this search entirely.
 */
export async function lookupStatus(input: {
  email: string
  lffId?: string
  fullName?: string
}): Promise<ActionResult<{ delegate: DelegateStatus }>> {
  await connectDB()

  const email = input.email.trim().toLowerCase()

  if (!email) {
    return { ok: false, error: "Enter the email you registered with." }
  }

  const query: Record<string, unknown> = { email }

  // A supplied LFF ID has to match the same record — it narrows, it never
  // widens, so it cannot be used to look someone else up.
  if (input.lffId?.trim()) {
    query.lffId = input.lffId.trim().toUpperCase()
  }

  if (input.fullName?.trim()) {
    // Case-insensitive exact match on the whole name — a substring match
    // would let "Ade" widen the search rather than narrow it.
    const escaped = input.fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    query.fullName = new RegExp(`^${escaped}$`, "i")
  }

  const matches = await DelegateModel.find(query).limit(2)

  if (matches.length === 0) {
    return { ok: false, error: NOT_FOUND }
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error:
        "More than one registration uses this email. Enter the full name you registered with, or the LFF ID once you have one, to find the right one.",
    }
  }

  return { ok: true, delegate: await toDelegateStatus(matches[0]) }
}

/** Loaded from a delegate's own emailed `/status/<token>` link — no typing needed. */
export async function getStatusByToken(
  token: string
): Promise<ActionResult<{ delegate: DelegateStatus }>> {
  await connectDB()

  if (!token) {
    return { ok: false, error: NOT_FOUND }
  }

  const delegate = await DelegateModel.findOne({ statusToken: token })

  if (!delegate) {
    return { ok: false, error: NOT_FOUND }
  }

  return { ok: true, delegate: await toDelegateStatus(delegate) }
}

/**
 * A delegate uploading proof of a bank transfer. This records the payment as
 * `submitted` — it does not confirm it. A sub-admin still has to check the
 * receipt against the bank before anyone's LFF ID is minted.
 *
 * Identified by `delegateId` rather than email: the delegate has already been
 * resolved to one specific registration by the time this runs (the status
 * page only shows the upload form once one is loaded), and with shared
 * emails now allowed, looking this up by email again could silently attach
 * the receipt to the wrong person's registration.
 */
export async function submitReceipt(input: {
  delegateId: string
  receiptUrl: string
  receiptPublicId: string
  amount: number
  note?: string
}): Promise<ActionResult> {
  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.delegateId)) {
    return { ok: false, error: NOT_FOUND }
  }

  const delegate = await DelegateModel.findById(input.delegateId)

  if (!delegate) {
    return { ok: false, error: NOT_FOUND }
  }

  if (!input.receiptUrl) {
    return { ok: false, error: "Attach a photo or PDF of your transfer receipt." }
  }

  const balance = Math.max(0, (delegate.totalDue ?? 0) - (delegate.totalPaid ?? 0))

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Enter the amount you transferred." }
  }

  if (input.amount > balance * 1.5) {
    return {
      ok: false,
      error: `That is far more than the ${formatNaira(balance)} outstanding. Check the amount.`,
    }
  }

  const reference = generateReference("RCP")

  await PaymentModel.create({
    delegateId: delegate._id,
    provider: "manual",
    reference,
    amount: Math.round(input.amount),
    status: "submitted",
    receiptUrl: input.receiptUrl,
    receiptPublicId: input.receiptPublicId,
    note: input.note ?? "",
  })

  await logActivity({
    action: "payment.receipt_submitted",
    entityType: "payment",
    entityId: reference,
    details: { delegateId: String(delegate._id), amount: input.amount },
  })

  revalidatePath("/dashboard/payments")

  return { ok: true }
}
