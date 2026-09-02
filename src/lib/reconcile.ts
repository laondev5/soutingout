import "server-only"
import { CounterModel, PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import {
  claimPaymentForReconciliation,
  confirmPayment,
  markPaymentFailed,
  scheduleRetry,
} from "@/lib/payments"
import { isPaystackConfigured, verifyTransaction } from "@/lib/paystack"
import { MAX_PAYMENT_ATTEMPTS } from "@/lib/constants"

export type ReconcileSummary = {
  checked: number
  confirmed: number
  stillPending: number
  failed: number
  errored: number
}

const EMPTY: ReconcileSummary = {
  checked: 0,
  confirmed: 0,
  stillPending: 0,
  failed: 0,
  errored: 0,
}

/**
 * Ask Paystack what happened to the payments that are due a check, and settle
 * them through the same `confirmPayment` the webhook uses.
 *
 * Bounded twice — by `limit` and by `budgetMs` — because this runs both from a
 * cron job and from a page render, and neither may run long.
 */
export async function reconcilePayments(
  options: { limit?: number; budgetMs?: number } = {}
): Promise<ReconcileSummary> {
  if (!isPaystackConfigured()) return { ...EMPTY }

  const limit = options.limit ?? 25
  const budgetMs = options.budgetMs ?? 20_000
  const deadline = Date.now() + budgetMs

  await connectDB()

  const summary = { ...EMPTY }

  for (let i = 0; i < limit; i += 1) {
    if (Date.now() > deadline) break

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

      // Still in flight. Give it the next backoff slot, or give up once the
      // schedule is exhausted.
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
      // A Paystack outage must not burn the retry schedule.
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

/**
 * Settle one reference now, ignoring its backoff.
 *
 * Used when a delegate returns from checkout: they are looking at the page, so
 * the answer is wanted immediately rather than on the next sweep.
 */
export async function reconcileOne(reference: string) {
  if (!isPaystackConfigured() || !reference) return { settled: false as const }

  await connectDB()

  const payment = await PaymentModel.findOne({ reference }).select("status")
  if (!payment || payment.status === "confirmed") {
    return { settled: false as const }
  }

  try {
    const verified = await verifyTransaction(reference)

    if (verified.status === "success") {
      await confirmPayment({ reference, rawResponse: verified.raw })
      return { settled: true as const }
    }

    if (verified.status === "failed" || verified.status === "reversed") {
      await markPaymentFailed({
        reference,
        error: verified.gatewayResponse ?? `Paystack reported ${verified.status}.`,
      })
    }
  } catch (error) {
    console.error("Immediate reconciliation failed", { reference, error })
  }

  return { settled: false as const }
}

// ── Throttle ─────────────────────────────────────────────────────────

const LOCK_ID = "reconcile:sweep"

/**
 * Let one sweep through per interval, across every server instance.
 *
 * The lock is a single document updated conditionally, so two requests landing
 * together cannot both win: the loser either matches nothing or trips the
 * unique `_id`, and is told to skip.
 */
export async function claimSweep(intervalMs: number) {
  await connectDB()

  const now = Date.now()

  try {
    const claimed = await CounterModel.findOneAndUpdate(
      { _id: LOCK_ID, value: { $lte: now } },
      { $set: { value: now + intervalMs } },
      { returnDocument: "after", upsert: true }
    )

    return Boolean(claimed)
  } catch (error) {
    // On the very first call two requests can race to upsert; the loser gets a
    // duplicate-key error, which simply means someone else is sweeping.
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}
