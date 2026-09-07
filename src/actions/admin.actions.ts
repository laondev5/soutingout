"use server"

import crypto from "node:crypto"
import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import bcryptjs from "bcryptjs"
import { DelegateModel, PastoralSessionModel, UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireUser } from "@/lib/permissions"
import { trySendEmail } from "@/lib/email"
import { staffPasswordSetupEmail } from "@/lib/email-templates"
import { logActivity } from "@/lib/activity-log"
import { assignDelegate } from "@/lib/assignment"
import { appUrl } from "@/lib/app-url"
import {
  generatePasswordSetupToken,
  passwordSetupPath,
  PASSWORD_SETUP_TTL_HOURS,
} from "@/lib/password-setup"
import {
  DEFAULT_PASTOR_PERMISSIONS,
  DEFAULT_SUB_ADMIN_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  type Permission,
} from "@/lib/constants"

type StaffRole = "sub_admin" | "pastor"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * A password nobody knows, not even the person creating the account.
 *
 * `passwordHash` is required by the schema, but a new account is only ever
 * meant to be opened through its set-password link — so it is seeded with
 * something random and discarded rather than anything a person could type.
 */
function unusablePassword() {
  return crypto.randomBytes(32).toString("base64url")
}

async function requireSuperAdminUser() {
  const user = await requireUser()
  if (user.role !== "super_admin") {
    return null
  }
  return user
}

export async function createStaff(input: {
  name: string
  email: string
  role: StaffRole
  phone?: string
  maxDelegates?: number
  permissions?: Permission[]
}): Promise<Result<{ setupUrl: string; emailSent: boolean }>> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can create staff accounts." }
  }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()

  if (!name || !email) {
    return { ok: false, error: "Enter a name and an email address." }
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." }
  }

  await connectDB()

  if (await UserModel.exists({ email })) {
    return { ok: false, error: "An account with that email already exists." }
  }

  const setup = generatePasswordSetupToken()
  const requested = input.permissions?.filter((p) =>
    (PERMISSIONS as readonly string[]).includes(p)
  )

  const user = await UserModel.create({
    name,
    email,
    phone: input.phone?.trim(),
    passwordHash: await bcryptjs.hash(unusablePassword(), 12),
    passwordSetupTokenHash: setup.tokenHash,
    passwordSetupExpiresAt: setup.expiresAt,
    role: input.role,
    permissions:
      requested && requested.length > 0
        ? requested
        : input.role === "pastor"
          ? DEFAULT_PASTOR_PERMISSIONS
          : DEFAULT_SUB_ADMIN_PERMISSIONS,
    maxDelegates: Math.max(0, input.maxDelegates ?? 0),
    isActive: true,
    createdByUserId: new mongoose.Types.ObjectId(actor.id),
  })

  await logActivity({
    actorUserId: actor.id,
    action: "user.created",
    entityType: "user",
    entityId: String(user._id),
    details: { email, role: input.role },
  })

  const setupUrl = `${appUrl()}${passwordSetupPath(setup.token)}`

  const { sent } = await trySendEmail({
    to: email,
    ...staffPasswordSetupEmail({
      name,
      email,
      roleLabel: ROLE_LABELS[input.role],
      setupUrl,
      expiresInHours: PASSWORD_SETUP_TTL_HOURS,
      reason: "invite",
    }),
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")

  // The link is returned so the super admin can pass it on by hand when email
  // delivery is not configured or bounces. It is the same one-time link that
  // was emailed — handing it over on WhatsApp is no weaker than the email.
  return { ok: true, setupUrl, emailSent: sent }
}

export async function setStaffActive(input: {
  userId: string
  isActive: boolean
}): Promise<Result> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can change staff accounts." }
  }

  if (input.userId === actor.id) {
    return { ok: false, error: "You cannot deactivate your own account." }
  }

  await connectDB()

  const user = await UserModel.findById(input.userId)
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  user.isActive = input.isActive
  await user.save()

  await logActivity({
    actorUserId: actor.id,
    action: input.isActive ? "user.activated" : "user.deactivated",
    entityType: "user",
    entityId: String(user._id),
    details: { email: user.email },
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")
  return { ok: true }
}

/**
 * Edit a staff account. Every field is optional — only what is passed is
 * changed, so the same action serves an inline rename and a full permission
 * rewrite.
 */
export async function updateStaff(input: {
  userId: string
  name?: string
  email?: string
  phone?: string
  role?: StaffRole
  maxDelegates?: number
  permissions?: Permission[]
}): Promise<Result> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can change staff accounts." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    return { ok: false, error: "That account could not be found." }
  }

  const user = await UserModel.findById(input.userId)

  // Super admins are deliberately out of reach here: this screen manages the
  // staff a super admin creates, not their own peers.
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  const changed: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { ok: false, error: "Enter a name." }
    if (name !== user.name) changed.name = name
    user.name = name
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." }
    }
    if (email !== user.email) {
      if (await UserModel.exists({ email, _id: { $ne: user._id } })) {
        return { ok: false, error: "Another account already uses that email." }
      }
      changed.email = email
      user.email = email
    }
  }

  if (input.phone !== undefined) {
    const phone = input.phone.trim()
    if (phone !== (user.phone ?? "")) changed.phone = phone
    user.phone = phone
  }

  if (input.role && input.role !== user.role) {
    // Moving between roles would strand whatever is assigned under the old
    // one — a pastor has no `assignedSubAdminId` to inherit. Make the super
    // admin hand the work over first, so nothing silently loses an owner.
    const field = user.role === "pastor" ? "assignedPastorId" : "assignedSubAdminId"
    // Cancelled delegates count too: they still carry this id, and the field
    // they carry it in only exists for the role being left behind.
    const holding = await DelegateModel.countDocuments({ [field]: user._id })

    if (holding > 0) {
      return {
        ok: false,
        error: `Reassign the ${holding} delegate${holding === 1 ? "" : "s"} ${user.name} holds before changing their role.`,
      }
    }

    changed.role = input.role
    user.role = input.role

    // The old role's permission set rarely fits the new one, so reset to the
    // new role's defaults unless this same call is setting them explicitly.
    if (!input.permissions) {
      user.permissions =
        input.role === "pastor" ? DEFAULT_PASTOR_PERMISSIONS : DEFAULT_SUB_ADMIN_PERMISSIONS
    }
  }

  if (typeof input.maxDelegates === "number") {
    const max = Math.max(0, Math.trunc(input.maxDelegates))
    if (max !== user.maxDelegates) changed.maxDelegates = max
    user.maxDelegates = max
  }

  if (input.permissions) {
    user.permissions = input.permissions.filter((p) =>
      (PERMISSIONS as readonly string[]).includes(p)
    )
    changed.permissions = user.permissions
  }

  await user.save()

  await logActivity({
    actorUserId: actor.id,
    action: "user.updated",
    entityType: "user",
    entityId: String(user._id),
    details: { email: user.email, changed },
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")
  return { ok: true }
}

/**
 * Remove a staff account for good.
 *
 * Delegates are the reason this is not a plain `deleteOne`: an account holding
 * delegates cannot simply vanish, or those delegates end up with no owner and
 * fall out of every scoped list. So the caller must either find the account
 * empty or name someone to take the work, and the handover runs through the
 * normal `assignDelegate` path — audit row, pastoral session, activity log.
 *
 * Audit history (assignments, activity, import batches) keeps pointing at the
 * deleted id on purpose. Those records are what happened, and the screens that
 * render them already cope with a name they cannot resolve.
 */
export async function deleteStaff(input: {
  userId: string
  reassignToUserId?: string
  /** Leave the delegates with no owner rather than handing them to someone. */
  unassign?: boolean
}): Promise<Result<{ reassigned: number; unassigned: number }>> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can delete staff accounts." }
  }

  if (input.userId === actor.id) {
    return { ok: false, error: "You cannot delete your own account." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    return { ok: false, error: "That account could not be found." }
  }

  const user = await UserModel.findById(input.userId)
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  const role: StaffRole = user.role === "pastor" ? "pastor" : "sub_admin"
  const field = role === "pastor" ? "assignedPastorId" : "assignedSubAdminId"

  // Cancelled delegates count too: they still carry this id, and leaving it
  // dangling would empty the owner column on the delegate list.
  const held = await DelegateModel.find({ [field]: user._id }).select("_id").lean()

  let reassigned = 0
  let unassigned = 0

  if (held.length > 0) {
    // Someone has to be left holding this work. With nobody else in the role
    // there is no one to hand it to, so the delegates are simply left unowned
    // for an admin to place later — the same outcome the super admin can ask
    // for outright.
    const successorsExist = await UserModel.exists({
      role,
      isActive: true,
      _id: { $ne: user._id },
    })

    const handOver = Boolean(input.reassignToUserId) && !input.unassign
    const leaveUnassigned = input.unassign || (!input.reassignToUserId && !successorsExist)

    if (!handOver && !leaveUnassigned) {
      return {
        ok: false,
        error: `${user.name} still has ${held.length} delegate${held.length === 1 ? "" : "s"}. Choose who takes them over, or leave them unassigned.`,
      }
    }

    if (handOver) {
      const successorId = input.reassignToUserId as string

      if (successorId === input.userId) {
        return { ok: false, error: "Choose a different person to take the delegates." }
      }

      if (!mongoose.Types.ObjectId.isValid(successorId)) {
        return { ok: false, error: "Choose who takes the delegates over." }
      }

      const successor = await UserModel.findById(successorId).select("role isActive")

      if (!successor || successor.role !== role) {
        return {
          ok: false,
          error: `Choose an active ${ROLE_LABELS[role].toLowerCase()} to take them over.`,
        }
      }

      if (!successor.isActive) {
        return { ok: false, error: "That account is deactivated — reactivate it first." }
      }

      for (const delegate of held) {
        // Deliberately not notified: handing over a whole caseload would send
        // one email per delegate. The new owner sees them on their next
        // dashboard load, and the activity log records the batch.
        const result = await assignDelegate({
          delegateId: delegate._id,
          role,
          toUserId: successor._id,
          reason: `Account for ${user.name} was deleted.`,
          actorUserId: actor.id,
          notify: false,
        })
        if (result.assigned) reassigned += 1
      }
    } else {
      const result = await DelegateModel.updateMany(
        { [field]: user._id },
        { $set: { [field]: null } }
      )
      unassigned = result.modifiedCount

      // Pastoral notes belong to the pastor who wrote them, not to the
      // delegate, so they go with the account rather than following anyone on.
      if (role === "pastor") {
        await PastoralSessionModel.deleteMany({ pastorId: user._id })
      }
    }
  }

  await UserModel.deleteOne({ _id: user._id })

  await logActivity({
    actorUserId: actor.id,
    action: "user.deleted",
    entityType: "user",
    entityId: String(user._id),
    details: {
      email: user.email,
      role,
      reassigned,
      unassigned,
      reassignedTo: input.reassignToUserId ?? null,
    },
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")
  revalidatePath("/dashboard/delegates")
  return { ok: true, reassigned, unassigned }
}

/**
 * Send a staff member a fresh one-time link to choose a new password.
 *
 * Their existing password keeps working until the link is actually used —
 * otherwise a reset whose email bounces would lock someone out with no way
 * back in. A super admin who suspects an account is compromised should
 * deactivate it, which is what actually shuts the door.
 */
export async function resetStaffPassword(input: {
  userId: string
}): Promise<Result<{ setupUrl: string; emailSent: boolean }>> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can reset a password." }
  }

  await connectDB()

  const user = await UserModel.findById(input.userId)
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  // Minting a new token invalidates any link sent earlier: only the newest
  // hash is stored, so the previous one stops matching.
  const setup = generatePasswordSetupToken()
  user.passwordSetupTokenHash = setup.tokenHash
  user.passwordSetupExpiresAt = setup.expiresAt
  await user.save()

  await logActivity({
    actorUserId: actor.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: String(user._id),
    details: { email: user.email },
  })

  const setupUrl = `${appUrl()}${passwordSetupPath(setup.token)}`

  const { sent } = await trySendEmail({
    to: user.email,
    ...staffPasswordSetupEmail({
      name: user.name,
      email: user.email,
      roleLabel: ROLE_LABELS[user.role],
      setupUrl,
      expiresInHours: PASSWORD_SETUP_TTL_HOURS,
      reason: "reset",
    }),
  })

  return { ok: true, setupUrl, emailSent: sent }
}
