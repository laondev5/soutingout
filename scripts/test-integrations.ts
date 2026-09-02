/**
 * Prove the third-party credentials in .env.local actually work, by making one
 * real call to each service. Run with: npm run test:integrations
 */
import { v2 as cloudinary } from "cloudinary"
import { emailTransportKind, verifyEmailTransport } from "@/lib/email"

// `@/lib/cloudinary`, `@/lib/paystack` and `@/lib/pusher` are marked
// `server-only`, which throws outside a Next request, so the few constants
// this script needs are restated here rather than imported.
const FOLDERS = { accommodations: "lff-sorting-out/accommodations" }

const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  )

const isPaystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY)

const isPusherConfigured = () =>
  Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.PUSHER_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.PUSHER_CLUSTER
  )

const ok = (label: string, detail = "") => console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`)
const bad = (label: string, detail = "") => console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)

async function checkEmail() {
  console.log("\nEmail")
  const result = await verifyEmailTransport()
  if (result.ok) ok(`${emailTransportKind()} transport`, "credentials accepted")
  else bad(`${result.kind} transport`, result.error)
}

async function checkCloudinary() {
  console.log("\nCloudinary")

  if (!isCloudinaryConfigured()) {
    bad("not configured")
    return
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })

  try {
    const ping = await cloudinary.api.ping()
    ok("API reachable", ping.status)

    // A real signed upload, then delete it again — this is the exact path the
    // browser takes, so it proves the signature and folder are right.
    const upload = await cloudinary.uploader.upload(
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      { folder: FOLDERS.accommodations, public_id: `selftest-${Date.now()}` }
    )
    ok("upload", upload.secure_url)

    await cloudinary.uploader.destroy(upload.public_id)
    ok("delete", upload.public_id)
  } catch (error) {
    bad("failed", (error as Error).message)
  }
}

async function checkPaystack() {
  console.log("\nPaystack")

  if (!isPaystackConfigured()) {
    bad("not configured")
    return
  }

  const key = process.env.PAYSTACK_SECRET_KEY as string
  ok("mode", key.startsWith("sk_test") ? "TEST keys" : "LIVE keys")

  try {
    const response = await fetch("https://api.paystack.co/bank?currency=NGN&perPage=1", {
      headers: { Authorization: `Bearer ${key}` },
    })
    const body = (await response.json()) as { status: boolean; message: string }

    if (response.ok && body.status) ok("secret key accepted")
    else bad("secret key rejected", body.message)
  } catch (error) {
    bad("unreachable", (error as Error).message)
  }

  const pub = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
  if (pub?.startsWith("pk_")) ok("public key present")
  else bad("public key missing")
}

function checkOthers() {
  console.log("\nOther")
  console.log(process.env.CRON_SECRET ? "  ✓ CRON_SECRET set" : "  ✗ CRON_SECRET missing")
  console.log(
    isPusherConfigured()
      ? "  ✓ Pusher configured"
      : "  – Pusher not configured (realtime updates skipped, nothing breaks)"
  )
  console.log(process.env.MONGODB_URI ? "  ✓ MONGODB_URI set" : "  ✗ MONGODB_URI missing")
}

async function main() {
  await checkEmail()
  await checkCloudinary()
  await checkPaystack()
  checkOthers()
  console.log("")
  // Cloudinary keeps a socket open, so exit rather than waiting on it.
  process.exit(0)
}

main()
