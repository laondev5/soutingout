import { NextResponse } from "next/server"
import { reconcilePayments } from "@/lib/reconcile"
import { isPaystackConfigured } from "@/lib/paystack"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  return request.headers.get("authorization") === `Bearer ${secret}`
}

/**
 * Scheduled payment reconciliation.
 *
 * This is the daily backstop, not the main path. Vercel's Hobby plan allows
 * only one cron run per day, so the frequent sweeps happen during server
 * rendering instead (`sweepPaymentsInBackground`), with the webhook as the
 * primary settlement route. All three share `reconcilePayments`.
 *
 * Nothing here is triggered by a browser.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!isPaystackConfigured()) {
    return NextResponse.json({ skipped: "Paystack is not configured." })
  }

  // Larger batch than the render-time sweep: this invocation has nothing else
  // to do and a full minute to do it in.
  const summary = await reconcilePayments({ limit: 200, budgetMs: 50_000 })
  console.info("[cron] reconcile-payments", summary)

  return NextResponse.json({ ok: true, ...summary })
}

// Vercel Cron issues GET; POST lets an external scheduler drive it too.
export const POST = GET
