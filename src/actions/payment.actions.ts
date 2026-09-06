"use server"

import mongoose from "mongoose"
import { DelegateModel, PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import {
  generateReference,
  initializeTransaction,
  isPaystackConfigured,
} from "@/lib/paystack"
import { logActivity } from "@/lib/activity-log"
import { appUrl } from "@/lib/app-url"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Start a Paystack checkout for what the delegate still owes — or, for an
 * installment, for part of it.
 *
 * `amount` is only ever a ceiling check against the database's own balance,
 * never a price the caller sets outright, so nothing about the total can be
 * edited in the browser. The Payment row is written as `pending` before the
 * redirect — that row is what the reconciliation cron later picks up if the
 * delegate closes the tab mid-payment and no webhook ever arrives.
 */
export async function initializePayment(input: {
  delegateId: string
  /** Naira. Omit to pay the full balance; give less for an installment. */
  amount?: number
}): Promise<ActionResult<{ authorizationUrl: string; reference: string }>> {
  if (!isPaystackConfigured()) {
    return { ok: false, error: "Online payment is not available yet. Please pay by transfer." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.delegateId)) {
    return { ok: false, error: "That registration could not be found." }
  }

  const delegate = await DelegateModel.findById(input.delegateId).select(
    "fullName email totalDue totalPaid registrationStatus"
  )

  if (!delegate) {
    return { ok: false, error: "That registration could not be found." }
  }

  if (delegate.registrationStatus === "cancelled") {
    return { ok: false, error: "That registration has been cancelled." }
  }

  const balance = Math.max(0, (delegate.totalDue ?? 0) - (delegate.totalPaid ?? 0))

  if (balance <= 0) {
    return { ok: false, error: "This registration is already paid in full." }
  }

  // An installment: whatever was asked for, clamped to something sane and
  // never more than what is actually owed.
  const payAmount =
    input.amount === undefined ? balance : Math.min(balance, Math.max(1, Math.round(input.amount)))

  // Always a fresh reference. Paystack's own `/initialize` rejects a second
  // call for a reference it has already seen ("Duplicate Transaction
  // Reference") — reusing one from an earlier, abandoned attempt would make
  // every retry after the first fail outright. An old pending row left behind
  // by an abandoned checkout is harmless: the reconciliation sweep settles or
  // eventually expires it on its own schedule.
  const reference = generateReference("PSK")

  let checkout
  try {
    checkout = await initializeTransaction({
      email: delegate.email,
      amountNaira: payAmount,
      reference,
      callbackUrl: `${appUrl()}/status?reference=${encodeURIComponent(reference)}`,
      metadata: {
        delegateId: String(delegate._id),
        fullName: delegate.fullName,
      },
    })
  } catch (error) {
    console.error("Paystack initialize failed", error)
    return { ok: false, error: "Could not reach Paystack. Please try again, or pay by transfer." }
  }

  await PaymentModel.create({
    delegateId: delegate._id,
    provider: "paystack",
    reference,
    amount: payAmount,
    status: "pending",
    attempts: 0,
    // Give the webhook a head start; the cron only steps in afterwards.
    nextRetryAt: new Date(Date.now() + 60_000),
  })

  await logActivity({
    action: "payment.initialized",
    entityType: "payment",
    entityId: reference,
    details: { delegateId: String(delegate._id), amount: payAmount, provider: "paystack" },
  })

  return { ok: true, authorizationUrl: checkout.authorization_url, reference }
}
