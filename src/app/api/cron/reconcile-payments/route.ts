import { NextResponse } from "next/server"
import { PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import {
  claimPaymentForReconciliation,
  confirmPayment,
  markPaymentFailed,
  scheduleRetry,
} from "@/lib/payments"
import { isPaystackConfigured, verifyTransaction } from "@/lib/paystack"
import { MAX_PAYMENT_ATTEMPTS } from "@/lib/constants"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** How many payments one invocation will chase, so a backlog can't run long. */
const BATCH_LIMIT = 25

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

/**
 * Server-side payment reconciliation. Nothing here is triggered by a browser:
 * Vercel Cron calls this on a schedule (see vercel.json), it asks Paystack
 * directly what happened to each pending payment, and it confirms through the
 * same `confirmPayment` the webhook uses.
 *
 * This is the safety net for the case the webhook cannot cover — the delegate
 * paid but the webhook never arrived, or arrived while the app was down.
 */
async function reconcile() {
  await connectDB()

  const summary = { checked: 0, confirmed: 0, stillPending: 0, failed: 0, errored: 0 }

  for (let i = 0; i < BATCH_LIMIT; i += 1) {
    // Atomic claim: bumps attempts and pushes nextRetryAt forward, so an
    // overlapping run cannot pick up the same row.
    const payment = await claimPaymentForReconciliation()
    if (!payment) break

    summary.checked += 1

    try {
      const verified = await verifyTransaction(payment.reference)

      if (verified.status === "success") {
        await confirmPayment({ reference: payment.reference, rawResponse: verified.raw })
        summary.confirmed += 1
        continue
      }

      if (verified.status === "failed" || verified.status === "reversed") {
        await markPaymentFailed({
          reference: payment.reference,
          error: verified.gatewayResponse ?? `Paystack reported ${verified.status}.`,
        })
        summary.failed += 1
        continue
      }

      // Still in flight (pending / ongoing / abandoned). Give it the next
      // backoff slot, or give up once the schedule is exhausted.
      if (payment.attempts >= MAX_PAYMENT_ATTEMPTS) {
        await markPaymentFailed({
          reference: payment.reference,
          error: "Payment was never completed.",
        })
        summary.failed += 1
      } else {
        await PaymentModel.updateOne(
          { _id: payment._id, status: "pending" },
          { $set: { nextRetryAt: scheduleRetry(payment.attempts), lastError: null } }
        )
        summary.stillPending += 1
      }
    } catch (error) {
      // A Paystack outage must not burn the retry schedule, so record the
      // error and come back on the normal backoff.
      summary.errored += 1
      await PaymentModel.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            nextRetryAt: scheduleRetry(payment.attempts),
            lastError: error instanceof Error ? error.message : "Verification failed.",
          },
        }
      )
    }
  }

  return summary
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!isPaystackConfigured()) {
    return NextResponse.json({ skipped: "Paystack is not configured." })
  }

  const summary = await reconcile()
  console.info("[cron] reconcile-payments", summary)

  return NextResponse.json({ ok: true, ...summary })
}

// Vercel Cron issues GET; POST is here so the job can also be triggered by an
// external scheduler that only speaks POST.
export const POST = GET
