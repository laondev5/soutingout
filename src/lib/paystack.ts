import "server-only"
import crypto from "node:crypto"

const BASE_URL = "https://api.paystack.co"

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.")
  }
  return key
}

export function isPaystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY)
}

/** Paystack works in kobo. Naira never leaves this module unconverted. */
export function toKobo(naira: number) {
  return Math.round(naira * 100)
}

export function fromKobo(kobo: number) {
  return Math.round(kobo) / 100
}

export type PaystackStatus = "success" | "failed" | "abandoned" | "pending" | "ongoing" | "reversed"

type PaystackResponse<T> = {
  status: boolean
  message: string
  data: T
}

async function request<T>(path: string, init?: RequestInit): Promise<PaystackResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })

  const payload = (await response.json()) as PaystackResponse<T>

  if (!response.ok) {
    throw new Error(
      `Paystack ${path} failed (${response.status}): ${payload?.message ?? "unknown error"}`
    )
  }

  return payload
}

export async function initializeTransaction(input: {
  email: string
  amountNaira: number
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}) {
  const payload = await request<{
    authorization_url: string
    access_code: string
    reference: string
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: toKobo(input.amountNaira),
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  })

  return payload.data
}

export async function verifyTransaction(reference: string) {
  const payload = await request<{
    status: PaystackStatus
    reference: string
    amount: number
    paid_at: string | null
    gateway_response: string | null
  }>(`/transaction/verify/${encodeURIComponent(reference)}`)

  return {
    status: payload.data.status,
    reference: payload.data.reference,
    amountNaira: fromKobo(payload.data.amount),
    paidAt: payload.data.paid_at ? new Date(payload.data.paid_at) : null,
    gatewayResponse: payload.data.gateway_response,
    raw: payload.data as unknown as Record<string, unknown>,
  }
}

/**
 * Paystack signs the raw request body with HMAC-SHA512 of the secret key.
 * The body must be the exact bytes received — parse only after this passes.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false

  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)

  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

export function generateReference(prefix = "LFF") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`
}
