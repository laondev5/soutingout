import "server-only"
import { redirect } from "next/navigation"
import mongoose from "mongoose"
import { auth } from "@/auth"
import type { Permission, Role } from "@/lib/constants"

export type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role: Role
  permissions: Permission[]
}

/** Where each role lands after login, and where it gets sent when out of bounds. */
export function homeFor(role: Role) {
  return role === "pastor" ? "/pastor" : "/dashboard"
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth()

  if (!session?.user) {
    redirect("/auth/login")
  }

  return session.user as SessionUser
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser()

  if (!roles.includes(user.role)) {
    redirect(homeFor(user.role))
  }

  return user
}

export async function requireSuperAdmin() {
  return requireRole("super_admin")
}

/** Super admins bypass the permission list entirely. */
export function can(user: Pick<SessionUser, "role" | "permissions">, permission: Permission) {
  return user.role === "super_admin" || user.permissions.includes(permission)
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser()

  if (!can(user, permission)) {
    redirect(homeFor(user.role))
  }

  return user
}

/**
 * The delegate query filter a user is allowed to see. Super admins see
 * everything; sub-admins and pastors see only what is assigned to them. Every
 * delegate read goes through this — never query DelegateModel unscoped.
 */
export function delegateScope(user: Pick<SessionUser, "id" | "role">) {
  switch (user.role) {
    case "super_admin":
      return {}
    case "sub_admin":
      return { assignedSubAdminId: new mongoose.Types.ObjectId(user.id) }
    case "pastor":
      return { assignedPastorId: new mongoose.Types.ObjectId(user.id) }
  }
}

/**
 * Guard for a single delegate by id. Returns false when the delegate exists but
 * is out of the user's scope, so callers can 404 rather than leak existence.
 */
export function canAccessDelegate(
  user: Pick<SessionUser, "id" | "role">,
  delegate: { assignedSubAdminId?: unknown; assignedPastorId?: unknown }
) {
  if (user.role === "super_admin") return true
  const assigned =
    user.role === "sub_admin" ? delegate.assignedSubAdminId : delegate.assignedPastorId
  return String(assigned ?? "") === user.id
}
