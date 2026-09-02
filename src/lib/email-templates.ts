import { EVENT, formatNaira } from "@/lib/constants"

function appUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return `${base.replace(/\/$/, "")}${path}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Inline styles only — email clients strip <style> blocks. */
function layout(input: { heading: string; body: string }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr>
        <td style="padding:20px 28px;background:#0f172a;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">${escapeHtml(EVENT.shortName)}</div>
          <div style="font-size:19px;font-weight:600;margin-top:4px;">${escapeHtml(input.heading)}</div>
        </td>
      </tr>
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;">${input.body}</td></tr>
      <tr>
        <td style="padding:18px 28px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;line-height:1.5;">
          ${escapeHtml(EVENT.dateLabel)} · ${escapeHtml(EVENT.venue)}<br />
          Host: ${escapeHtml(EVENT.host)} · Enquiries: ${escapeHtml(EVENT.supportPhone)}
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function idBadge(label: string, value: string) {
  return `<td style="padding:12px 14px;background:#f4f4f5;border-radius:8px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;">${escapeHtml(label)}</div>
    <div style="font-size:19px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:3px;">${escapeHtml(value)}</div>
  </td>`
}

/** Sent the moment a registration lands. No identifiers yet — those wait for payment. */
export function registrationReceivedEmail(input: {
  fullName: string
  accommodationName: string
  totalDue: number
}) {
  const body = `
    <p>Hello ${escapeHtml(input.fullName)},</p>
    <p>We have received your registration for the <strong>${escapeHtml(EVENT.name)}</strong>.</p>
    <p style="margin:0 0 6px;">Your selection:</p>
    <ul style="margin:0 0 18px;padding-left:20px;">
      <li>Accommodation: <strong>${escapeHtml(input.accommodationName)}</strong></li>
      <li>Total due: <strong>${formatNaira(input.totalDue)}</strong></li>
    </ul>
    <p><strong>Your place is not reserved until payment is confirmed.</strong> Allocation is on a first-pay, first-serve basis.</p>
    <p style="margin:0 0 6px;">Transfer to:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;line-height:1.7;">
      <tr><td style="color:#71717a;padding-right:12px;">Account name</td><td><strong>${escapeHtml(EVENT.bank.accountName)}</strong></td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Account number</td><td><strong>${escapeHtml(EVENT.bank.accountNumber)}</strong></td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Bank</td><td><strong>${escapeHtml(EVENT.bank.bankName)}</strong></td></tr>
    </table>
    <p>Then upload your proof of payment here:</p>
    <p><a href="${appUrl("/status")}" style="display:inline-block;padding:11px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Upload proof of payment</a></p>
    <p style="color:#71717a;font-size:13px;">Installment payments are accepted, but the full amount must be paid before the retreat.</p>`

  return {
    subject: `Registration received — ${EVENT.shortName}`,
    html: layout({ heading: "Registration received", body }),
    text: `Hello ${input.fullName},\n\nWe have received your registration for the ${EVENT.name}.\n\nAccommodation: ${input.accommodationName}\nTotal due: ${formatNaira(input.totalDue)}\n\nYour place is not reserved until payment is confirmed.\n\nAccount name: ${EVENT.bank.accountName}\nAccount number: ${EVENT.bank.accountNumber}\nBank: ${EVENT.bank.bankName}\n\nUpload proof of payment: ${appUrl("/status")}`,
  }
}

/** The one email carrying both identifiers. Sent only on payment confirmation. */
export function paymentConfirmedEmail(input: {
  fullName: string
  lffId: string
  accommodationCode: string
  accommodationName: string
  amountPaid: number
  balance: number
}) {
  const balanceNote =
    input.balance > 0
      ? `<p style="padding:12px 14px;background:#fef3c7;border-radius:8px;color:#78350f;">A balance of <strong>${formatNaira(input.balance)}</strong> is still outstanding. Please complete it before the retreat.</p>`
      : `<p style="padding:12px 14px;background:#dcfce7;border-radius:8px;color:#14532d;">Your payment is complete. Nothing further is owed.</p>`

  const body = `
    <p>Hello ${escapeHtml(input.fullName)},</p>
    <p>Your payment of <strong>${formatNaira(input.amountPaid)}</strong> has been confirmed and your accommodation is now reserved.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;width:100%;">
      <tr>
        ${idBadge("Your LFF ID", input.lffId)}
        <td style="width:12px;"></td>
        ${idBadge("Accommodation code", input.accommodationCode)}
      </tr>
    </table>
    <p>You have been allocated <strong>${escapeHtml(input.accommodationName)}</strong>. Please bring both codes with you — they are how our team identifies you and your lodging on arrival.</p>
    ${balanceNote}
    <p style="margin-top:18px;">Arrival opens Friday, 2nd October 2026. The retreat begins at ${escapeHtml(EVENT.startTimeLabel)}.</p>
    <p style="color:#71717a;font-size:13px;">Feeding is once daily as delegates are expected to be on a fast. If a medical condition prevents you fasting, please bring your own snacks.</p>`

  return {
    subject: `You're confirmed — ${input.lffId}`,
    html: layout({ heading: "Payment confirmed", body }),
    text: `Hello ${input.fullName},\n\nYour payment of ${formatNaira(input.amountPaid)} has been confirmed.\n\nLFF ID: ${input.lffId}\nAccommodation code: ${input.accommodationCode}\nAccommodation: ${input.accommodationName}\n\n${input.balance > 0 ? `Outstanding balance: ${formatNaira(input.balance)}` : "Your payment is complete."}\n\nBring both codes with you.`,
  }
}

/** Sent to a sub-admin when a delegate lands on their list. */
export function delegateAssignedEmail(input: {
  subAdminName: string
  delegateName: string
  delegateEmail: string
  delegatePhone: string
  accommodationName: string
  totalDue: number
  delegateId: string
  reassignedFrom?: string | null
}) {
  const intro = input.reassignedFrom
    ? `<p><strong>${escapeHtml(input.delegateName)}</strong> has been reassigned to you from ${escapeHtml(input.reassignedFrom)}.</p>`
    : `<p>A new delegate, <strong>${escapeHtml(input.delegateName)}</strong>, has been assigned to you.</p>`

  const body = `
    <p>Hello ${escapeHtml(input.subAdminName)},</p>
    ${intro}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;line-height:1.7;">
      <tr><td style="color:#71717a;padding-right:12px;">Email</td><td>${escapeHtml(input.delegateEmail)}</td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Phone</td><td>${escapeHtml(input.delegatePhone)}</td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Accommodation</td><td>${escapeHtml(input.accommodationName)}</td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Total due</td><td><strong>${formatNaira(input.totalDue)}</strong></td></tr>
    </table>
    <p>They are <strong>pending</strong> until you confirm their payment.</p>
    <p><a href="${appUrl(`/dashboard/delegates/${input.delegateId}`)}" style="display:inline-block;padding:11px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Open delegate</a></p>`

  return {
    subject: input.reassignedFrom
      ? `Delegate reassigned to you — ${input.delegateName}`
      : `New delegate assigned — ${input.delegateName}`,
    html: layout({
      heading: input.reassignedFrom ? "Delegate reassigned to you" : "New delegate assigned",
      body,
    }),
    text: `Hello ${input.subAdminName},\n\n${input.reassignedFrom ? `${input.delegateName} has been reassigned to you from ${input.reassignedFrom}.` : `A new delegate, ${input.delegateName}, has been assigned to you.`}\n\nEmail: ${input.delegateEmail}\nPhone: ${input.delegatePhone}\nAccommodation: ${input.accommodationName}\nTotal due: ${formatNaira(input.totalDue)}\n\nOpen: ${appUrl(`/dashboard/delegates/${input.delegateId}`)}`,
  }
}

/** Sent to the previous owner so a handoff is never silent. */
export function delegateUnassignedEmail(input: {
  subAdminName: string
  delegateName: string
  newOwnerName: string
  reason?: string
}) {
  const body = `
    <p>Hello ${escapeHtml(input.subAdminName)},</p>
    <p><strong>${escapeHtml(input.delegateName)}</strong> has been moved off your list to ${escapeHtml(input.newOwnerName)}.</p>
    ${input.reason ? `<p style="padding:12px 14px;background:#f4f4f5;border-radius:8px;">Reason: ${escapeHtml(input.reason)}</p>` : ""}
    <p>No further action is needed from you.</p>`

  return {
    subject: `Delegate reassigned — ${input.delegateName}`,
    html: layout({ heading: "Delegate reassigned", body }),
    text: `Hello ${input.subAdminName},\n\n${input.delegateName} has been moved off your list to ${input.newOwnerName}.${input.reason ? `\n\nReason: ${input.reason}` : ""}`,
  }
}

/** Credentials for a newly created sub-admin or pastor. */
export function staffWelcomeEmail(input: {
  name: string
  email: string
  temporaryPassword: string
  roleLabel: string
}) {
  const body = `
    <p>Hello ${escapeHtml(input.name)},</p>
    <p>An account has been created for you as <strong>${escapeHtml(input.roleLabel)}</strong> on the ${escapeHtml(EVENT.shortName)} dashboard.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px;line-height:1.7;">
      <tr><td style="color:#71717a;padding-right:12px;">Email</td><td>${escapeHtml(input.email)}</td></tr>
      <tr><td style="color:#71717a;padding-right:12px;">Temporary password</td><td><strong style="font-family:ui-monospace,Menlo,monospace;">${escapeHtml(input.temporaryPassword)}</strong></td></tr>
    </table>
    <p><a href="${appUrl("/auth/login")}" style="display:inline-block;padding:11px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a></p>
    <p style="color:#71717a;font-size:13px;">Please change this password after your first sign-in.</p>`

  return {
    subject: `Your ${EVENT.shortName} dashboard account`,
    html: layout({ heading: "Your dashboard account", body }),
    text: `Hello ${input.name},\n\nAn account has been created for you as ${input.roleLabel}.\n\nEmail: ${input.email}\nTemporary password: ${input.temporaryPassword}\n\nSign in: ${appUrl("/auth/login")}\n\nPlease change this password after your first sign-in.`,
  }
}

/** Sent by the reconciliation cron once a gateway payment is definitively dead. */
export function paymentFailedEmail(input: {
  fullName: string
  amount: number
  reference: string
}) {
  const body = `
    <p>Hello ${escapeHtml(input.fullName)},</p>
    <p>We were unable to confirm your payment of <strong>${formatNaira(input.amount)}</strong> (reference <code>${escapeHtml(input.reference)}</code>).</p>
    <p>If money left your account, do not pay again — reply to this email or contact us on ${escapeHtml(EVENT.supportPhone)} and we will trace it.</p>
    <p>Otherwise you can try again, or pay by transfer:</p>
    <p><a href="${appUrl("/status")}" style="display:inline-block;padding:11px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Retry payment</a></p>`

  return {
    subject: `Payment could not be confirmed — ${EVENT.shortName}`,
    html: layout({ heading: "Payment could not be confirmed", body }),
    text: `Hello ${input.fullName},\n\nWe were unable to confirm your payment of ${formatNaira(input.amount)} (reference ${input.reference}).\n\nIf money left your account, do not pay again — contact us on ${EVENT.supportPhone}.\n\nRetry: ${appUrl("/status")}`,
  }
}
