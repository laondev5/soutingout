import { NextResponse } from "next/server"
import { confirmPayment, markPaymentFailed } from "@/lib/payments"
import { verifyWebhookSignature } from "@/lib/paystack"

/** Paystack posts events here. The route must never be cached or prerendered. */
export const dynamic = "force-dynamic"

type PaystackEvent = {
  event: string
  data: { reference?: string; status?: string; gateway_response?: string }
}

export async function POST(request: Request) {
  // The signature covers the exact bytes Paystack sent, so read the raw body
  // and verify before parsing. Parsing first and re-serialising would change
  // the bytes and break the HMAC.
  const rawBody = await request.text()
  const signature = request.headers.get("x-paystack-signature")

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 })
  }

  let event: PaystackEvent
  try {
    event = JSON.parse(rawBody) as PaystackEvent
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 })
  }

  const reference = event.data?.reference
  if (!reference) {
    return NextResponse.json({ received: true })
  }

  if (event.event === "charge.success") {
    // Shares one confirmation path with the cron. Whichever arrives first
    // wins; the second call is a no-op.
    const result = await confirmPayment({
      reference,
      rawResponse: event.data as unknown as Record<string, unknown>,
    })

    if (!result.ok) {
      // A reference we have no record of is not our problem to retry — but it
      // is worth knowing about, so log it and still return 200 so Paystack
      // stops redelivering.
      console.warn("Paystack webhook for unknown reference", { reference, reason: result.reason })
    }

    return NextResponse.json({ received: true })
  }

  if (event.event === "charge.failed") {
    await markPaymentFailed({
      reference,
      error: event.data?.gateway_response ?? "Payment failed at Paystack.",
    })
  }

  // Everything else (transfers, refunds, subscriptions) is acknowledged and
  // ignored — returning non-200 would make Paystack retry forever.
  return NextResponse.json({ received: true })
}
