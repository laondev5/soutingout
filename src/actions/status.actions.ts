"use server"

import { revalidatePath } from "next/cache"
import { AccommodationModel, DelegateModel, PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { generateReference } from "@/lib/paystack"
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
}

const NOT_FOUND =
  "We could not find a registration with that email. Check the address you registered with."

/**
 * Delegates have no password. They identify themselves with the email they
 * registered with, optionally alongside their LFF ID once they have one.
 * Only their own record is ever returned, and never anyone else's details.
 */
export async function lookupStatus(input: {
  email: string
  lffId?: string
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

  const delegate = await DelegateModel.findOne(query)

  if (!delegate) {
    return { ok: false, error: NOT_FOUND }
  }

  const [accommodation, pendingReceipt] = await Promise.all([
    delegate.accommodationId
      ? AccommodationModel.findById(delegate.accommodationId).select("name").lean()
      : null,
    PaymentModel.countDocuments({ delegateId: delegate._id, status: "submitted" }),
  ])

  return {
    ok: true,
    delegate: {
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
    },
  }
}

/**
 * A delegate uploading proof of a bank transfer. This records the payment as
 * `submitted` — it does not confirm it. A sub-admin still has to check the
 * receipt against the bank before anyone's LFF ID is minted.
 */
export async function submitReceipt(input: {
  email: string
  receiptUrl: string
  receiptPublicId: string
  amount: number
  note?: string
}): Promise<ActionResult> {
  await connectDB()

  const delegate = await DelegateModel.findOne({ email: input.email.trim().toLowerCase() })

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
