import { emailTransportKind, fromAddress, sendEmailMessage, verifyEmailTransport } from "../src/lib/email"
import { paymentConfirmedEmail } from "../src/lib/email-templates"

/**
 * Proves the email credentials actually deliver:
 *   npm run test:email you@example.com
 */
async function run() {
  const to = process.argv[2]

  console.log("transport:", emailTransportKind())
  console.log("from:     ", fromAddress())

  const check = await verifyEmailTransport()
  if (!check.ok) {
    console.error(`\n✗ Transport not usable: ${check.error}`)
    console.error("\nSet ONE of these in .env.local, then re-run:")
    console.error("  RESEND_API_KEY=re_...                      (Resend)")
    console.error("  SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS=  (any SMTP provider)")
    console.error("  GMAIL_USER= GMAIL_APP_PASSWORD=            (Gmail app password)")
    console.error("Also set EMAIL_FROM to a verified sender address.")
    process.exit(1)
  }

  console.log("✓ Credentials accepted by the server.")

  if (!to) {
    console.log("\nPass a recipient to send a real test message:")
    console.log("  npm run test:email you@example.com")
    process.exit(0)
  }

  // Send a real template so the actual layout is what gets checked.
  const message = paymentConfirmedEmail({
    fullName: "Test Delegate",
    lffId: "LFF-KMS26-0001",
    accommodationCode: "GEN-KMS26-0001",
    accommodationName: "General hostels",
    amountPaid: 35_000,
    balance: 0,
  })

  await sendEmailMessage({ to, ...message })
  console.log(`✓ Sent "${message.subject}" to ${to}. Check the inbox (and spam).`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
