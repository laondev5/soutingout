import nodemailer from "nodemailer"

let cached: nodemailer.Transporter | null = null

export type EmailTransportKind = "resend" | "smtp" | "gmail" | "dev"

/**
 * Which transport the current environment will use. Checked in priority order
 * so a project can move from Gmail to Resend by adding one variable.
 */
export function emailTransportKind(): EmailTransportKind {
  if (process.env.RESEND_API_KEY) return "resend"
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp"
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail"
  return "dev"
}

export function isEmailConfigured() {
  return emailTransportKind() !== "dev"
}

function build(): nodemailer.Transporter {
  switch (emailTransportKind()) {
    case "resend":
      // Resend's SMTP bridge: the username is the literal "resend" and the
      // password is the API key, so no extra SDK is needed.
      return nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { user: "resend", pass: process.env.RESEND_API_KEY as string },
      })

    case "smtp": {
      const port = Number(process.env.SMTP_PORT ?? 587)
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST as string,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER as string, pass: process.env.SMTP_PASS as string },
      })
    }

    case "gmail":
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER as string,
          pass: process.env.GMAIL_APP_PASSWORD as string,
        },
      })

    case "dev":
      // Without credentials the full send path still runs so templates and
      // recipients can be verified; jsonTransport renders the message and
      // hands it back instead of delivering it.
      console.warn("[email] No credentials set — falling back to jsonTransport (dev only).")
      return nodemailer.createTransport({ jsonTransport: true })
  }
}

function getTransporter() {
  if (!cached) {
    if (emailTransportKind() === "dev" && process.env.NODE_ENV === "production") {
      throw new Error(
        "No email transport configured. Set RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS, or GMAIL_USER/GMAIL_APP_PASSWORD."
      )
    }
    cached = build()
  }
  return cached
}

export function fromAddress() {
  return (
    process.env.EMAIL_FROM ??
    process.env.GMAIL_USER ??
    process.env.SMTP_USER ??
    "no-reply@lff.local"
  )
}

export async function sendEmailMessage(input: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  const info = await getTransporter().sendMail({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })

  if (emailTransportKind() === "dev") {
    console.info(`[email] (not delivered) to=${input.to} subject=${input.subject}`)
  }

  return info
}

/**
 * Email failures must not roll back the action that triggered them — a
 * delegate is still confirmed even if the confirmation email bounces.
 * Callers that need delivery guarantees should check the returned flag.
 */
export async function trySendEmail(input: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  try {
    await sendEmailMessage(input)
    // A dev-transport "send" never reached anyone, so don't report it as sent.
    return { sent: emailTransportKind() !== "dev" }
  } catch (error) {
    console.error("Failed to send email", { to: input.to, subject: input.subject, error })
    return { sent: false, error }
  }
}

/** Prove the credentials work before relying on them. Used by `npm run test:email`. */
export async function verifyEmailTransport() {
  const kind = emailTransportKind()
  if (kind === "dev") {
    return { ok: false as const, kind, error: "No credentials configured." }
  }

  try {
    await getTransporter().verify()
    return { ok: true as const, kind }
  } catch (error) {
    return { ok: false as const, kind, error: (error as Error).message }
  }
}
