"use server"

import crypto from "node:crypto"
import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import bcryptjs from "bcryptjs"
import { UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireUser } from "@/lib/permissions"
import { trySendEmail } from "@/lib/email"
import { staffWelcomeEmail } from "@/lib/email-templates"
import { logActivity } from "@/lib/activity-log"
import {
  DEFAULT_PASTOR_PERMISSIONS,
  DEFAULT_SUB_ADMIN_PERMISSIONS,
  PERMISSIONS,
  ROLE_LABELS,
  type Permission,
} from "@/lib/constants"

type StaffRole = "sub_admin" | "pastor"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Readable but strong enough for a one-time credential. */
function temporaryPassword() {
  return crypto.randomBytes(9).toString("base64url")
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
}): Promise<Result<{ temporaryPassword: string; emailSent: boolean }>> {
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

  const password = temporaryPassword()
  const requested = input.permissions?.filter((p) =>
    (PERMISSIONS as readonly string[]).includes(p)
  )

  const user = await UserModel.create({
    name,
    email,
    phone: input.phone?.trim(),
    passwordHash: await bcryptjs.hash(password, 12),
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

  const { sent } = await trySendEmail({
    to: email,
    ...staffWelcomeEmail({
      name,
      email,
      temporaryPassword: password,
      roleLabel: ROLE_LABELS[input.role],
    }),
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")

  // The password is returned so the super admin can pass it on by hand when
  // email delivery is not configured or bounces.
  return { ok: true, temporaryPassword: password, emailSent: sent }
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

export async function updateStaff(input: {
  userId: string
  maxDelegates?: number
  permissions?: Permission[]
}): Promise<Result> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can change staff accounts." }
  }

  await connectDB()

  const user = await UserModel.findById(input.userId)
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  if (typeof input.maxDelegates === "number") {
    user.maxDelegates = Math.max(0, input.maxDelegates)
  }

  if (input.permissions) {
    user.permissions = input.permissions.filter((p) =>
      (PERMISSIONS as readonly string[]).includes(p)
    )
  }

  await user.save()

  await logActivity({
    actorUserId: actor.id,
    action: "user.updated",
    entityType: "user",
    entityId: String(user._id),
    details: { maxDelegates: user.maxDelegates, permissions: user.permissions },
  })

  revalidatePath("/dashboard/admins")
  revalidatePath("/dashboard/pastors")
  return { ok: true }
}

export async function resetStaffPassword(input: {
  userId: string
}): Promise<Result<{ temporaryPassword: string; emailSent: boolean }>> {
  const actor = await requireSuperAdminUser()
  if (!actor) {
    return { ok: false, error: "Only a super admin can reset a password." }
  }

  await connectDB()

  const user = await UserModel.findById(input.userId)
  if (!user || user.role === "super_admin") {
    return { ok: false, error: "That account could not be found." }
  }

  const password = temporaryPassword()
  user.passwordHash = await bcryptjs.hash(password, 12)
  await user.save()

  await logActivity({
    actorUserId: actor.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: String(user._id),
    details: { email: user.email },
  })

  const { sent } = await trySendEmail({
    to: user.email,
    ...staffWelcomeEmail({
      name: user.name,
      email: user.email,
      temporaryPassword: password,
      roleLabel: ROLE_LABELS[user.role],
    }),
  })

  return { ok: true, temporaryPassword: password, emailSent: sent }
}
