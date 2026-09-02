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
 * Start a Paystack checkout for whatever the delegate still owes.
 *
 * The amount is read from the database, never from the caller, so the price
 * cannot be edited in the browser. The Payment row is written as `pending`
 * before the redirect — that row is what the reconciliation cron later picks
 * up if the delegate closes the tab mid-payment and no webhook ever arrives.
 */
export async function initializePayment(input: {
  delegateId: string
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

  // Reuse a checkout that is still open rather than stacking up references
  // for one delegate — each extra pending row is another thing the cron has
  // to chase down.
  const open = await PaymentModel.findOne({
    delegateId: delegate._id,
    provider: "paystack",
    status: "pending",
    amount: balance,
  }).sort({ createdAt: -1 })

  const reference = open?.reference ?? generateReference("PSK")

  let checkout
  try {
    checkout = await initializeTransaction({
      email: delegate.email,
      amountNaira: balance,
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

  if (!open) {
    await PaymentModel.create({
      delegateId: delegate._id,
      provider: "paystack",
      reference,
      amount: balance,
      status: "pending",
      attempts: 0,
      // Give the webhook a head start; the cron only steps in afterwards.
      nextRetryAt: new Date(Date.now() + 60_000),
    })

    await logActivity({
      action: "payment.initialized",
      entityType: "payment",
      entityId: reference,
      details: { delegateId: String(delegate._id), amount: balance, provider: "paystack" },
    })
  }

  return { ok: true, authorizationUrl: checkout.authorization_url, reference }
}
