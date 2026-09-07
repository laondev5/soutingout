"use server"

import bcryptjs from "bcryptjs"
import { UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { logActivity } from "@/lib/activity-log"
import { hashPasswordSetupToken, MIN_PASSWORD_LENGTH } from "@/lib/password-setup"
import { ROLE_LABELS, type Role } from "@/lib/constants"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Deliberately the same wording for every failure — expired, already used,
 * never existed, account since deactivated. Telling them apart would let
 * someone probe which links are real.
 */
const INVALID = "This link is no longer valid. Ask a super admin to send you a new one."

/**
 * Look up the account a set-password link belongs to, without redeeming it.
 *
 * Used to render the form (and to greet the right person) before they type
 * anything, so an expired link says so up front rather than after a password
 * has been chosen.
 */
export async function checkPasswordSetupToken(
  token: string
): Promise<Result<{ name: string; email: string; roleLabel: string }>> {
  if (!token) return { ok: false, error: INVALID }

  await connectDB()

  const user = await UserModel.findOne({
    passwordSetupTokenHash: hashPasswordSetupToken(token),
    passwordSetupExpiresAt: { $gt: new Date() },
  }).select("name email role isActive")

  if (!user || !user.isActive) {
    return { ok: false, error: INVALID }
  }

  return {
    ok: true,
    name: user.name,
    email: user.email,
    roleLabel: ROLE_LABELS[user.role as Role],
  }
}

/**
 * Redeem the link and set the password.
 *
 * The link is spent *before* the password is written, in a conditional update
 * that only matches while the token is still there — so two submissions race
 * for the claim and exactly one wins. Doing it in this order means the failure
 * mode is a spent link and an unchanged password (recoverable: ask for another
 * link), never a changed password behind a link that still works.
 */
export async function setPasswordWithToken(input: {
  token: string
  password: string
  confirmPassword: string
}): Promise<Result<{ email: string }>> {
  if (!input.token) return { ok: false, error: INVALID }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }

  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "The two passwords do not match." }
  }

  await connectDB()

  const tokenHash = hashPasswordSetupToken(input.token)

  // Spend the link. Whoever's update matches the still-present token wins;
  // a second submission finds it already null and matches nothing.
  const claimed = await UserModel.findOneAndUpdate(
    {
      passwordSetupTokenHash: tokenHash,
      passwordSetupExpiresAt: { $gt: new Date() },
      isActive: true,
    },
    { $set: { passwordSetupTokenHash: null, passwordSetupExpiresAt: null } },
    { returnDocument: "after" }
  )

  if (!claimed) {
    return { ok: false, error: INVALID }
  }

  // The claim is only real if the token is actually gone. It would not be if
  // the running process registered this model before these fields existed —
  // Mongoose drops unknown paths from an update without complaining, which
  // would otherwise leave a link that can be used forever.
  if (claimed.passwordSetupTokenHash !== null) {
    console.error(
      "Set-password link was not cleared — the User model looks out of date. Restart the server.",
      { userId: String(claimed._id) }
    )
    return { ok: false, error: "Something went wrong. Please ask a super admin for a new link." }
  }

  claimed.passwordHash = await bcryptjs.hash(input.password, 12)
  await claimed.save()

  await logActivity({
    actorUserId: String(claimed._id),
    action: "user.password_set",
    entityType: "user",
    entityId: String(claimed._id),
    details: { email: claimed.email },
  })

  return { ok: true, email: claimed.email }
}
