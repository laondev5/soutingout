import "server-only"
import { after } from "next/server"
import { claimSweep, reconcilePayments } from "@/lib/reconcile"
import { isPaystackConfigured } from "@/lib/paystack"

/**
 * How often a page render is allowed to trigger a sweep. Short enough that an
 * abandoned checkout is settled within minutes on a busy dashboard, long
 * enough that a burst of traffic does not hammer Paystack.
 */
const SWEEP_INTERVAL_MS = 3 * 60_000

/** Small batch: this shares a serverless invocation with a page render. */
const SWEEP_LIMIT = 10
const SWEEP_BUDGET_MS = 8_000

/**
 * Reconcile pending payments during normal server rendering.
 *
 * This is the replacement for a frequent cron job, which Vercel's Hobby plan
 * caps at one run per day. It is still entirely server-side — `after()` runs
 * the work on the server once the response has been sent, so it costs the
 * visitor nothing and no request is made from the browser.
 *
 * Safe to call from any server component: it never throws, and a failed sweep
 * only means the next render tries again.
 */
export function sweepPaymentsInBackground() {
  if (!isPaystackConfigured()) return

  after(async () => {
    try {
      const claimed = await claimSweep(SWEEP_INTERVAL_MS)
      if (!claimed) return

      const summary = await reconcilePayments({
        limit: SWEEP_LIMIT,
        budgetMs: SWEEP_BUDGET_MS,
      })

      if (summary.checked > 0) {
        console.info("[reconcile] background sweep", summary)
      }
    } catch (error) {
      // Reconciliation is a safety net; the webhook is the primary path. A
      // failure here must never surface to whoever happened to load the page.
      console.error("[reconcile] background sweep failed", error)
    }
  })
}
