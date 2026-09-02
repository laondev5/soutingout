import mongoose from "mongoose"
import {
  AccommodationModel,
  AssignmentModel,
  DelegateModel,
  PastoralSessionModel,
  UserModel,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { trySendEmail } from "@/lib/email"
import { delegateAssignedEmail, delegateUnassignedEmail } from "@/lib/email-templates"
import { logActivity } from "@/lib/activity-log"
import { publishDashboardEvent } from "@/lib/pusher"

export type AssignableRole = "sub_admin" | "pastor"

const FIELD: Record<AssignableRole, "assignedSubAdminId" | "assignedPastorId"> = {
  sub_admin: "assignedSubAdminId",
  pastor: "assignedPastorId",
}

/**
 * Least-loaded wins, counting only delegates that are still open work
 * (cancelled ones don't hold a slot). Anyone at their `maxDelegates` cap is
 * skipped; `maxDelegates: 0` means uncapped. Ties break on the oldest user id,
 * which makes the spread deterministic and testable.
 */
export async function pickAssignee(role: AssignableRole) {
  await connectDB()

  const candidates = await UserModel.find({ role, isActive: true }).select("_id maxDelegates").lean()

  if (candidates.length === 0) {
    return null
  }

  const counts = await DelegateModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    {
      $match: {
        [FIELD[role]]: { $in: candidates.map((c) => c._id) },
        registrationStatus: { $ne: "cancelled" },
      },
    },
    { $group: { _id: `$${FIELD[role]}`, count: { $sum: 1 } } },
  ])

  const loadByUser = new Map(counts.map((row) => [String(row._id), row.count]))

  const eligible = candidates
    .map((candidate) => ({
      id: candidate._id,
      load: loadByUser.get(String(candidate._id)) ?? 0,
      cap: candidate.maxDelegates ?? 0,
    }))
    .filter((candidate) => candidate.cap === 0 || candidate.load < candidate.cap)

  if (eligible.length === 0) {
    return null
  }

  eligible.sort((a, b) => a.load - b.load || String(a.id).localeCompare(String(b.id)))

  return eligible[0].id
}

/**
 * Point a delegate at a sub-admin or pastor and tell everyone affected.
 * Pass `toUserId` for a manual reassignment; omit it to auto-assign.
 * A no-op (already assigned to that user) returns without emailing.
 */
export async function assignDelegate(input: {
  delegateId: string | mongoose.Types.ObjectId
  role: AssignableRole
  toUserId?: string | mongoose.Types.ObjectId | null
  reason?: string
  actorUserId?: string | null
  /** Skip notification when bulk-importing, to avoid a mail storm. */
  notify?: boolean
}) {
  await connectDB()

  const notify = input.notify ?? true
  const field = FIELD[input.role]
  const mode: "auto" | "manual" = input.toUserId ? "manual" : "auto"

  const delegate = await DelegateModel.findById(input.delegateId)
  if (!delegate) {
    return { assigned: false as const, reason: "delegate_not_found" as const }
  }

  const toUserId = input.toUserId
    ? new mongoose.Types.ObjectId(String(input.toUserId))
    : await pickAssignee(input.role)

  if (!toUserId) {
    return { assigned: false as const, reason: "no_available_assignee" as const }
  }

  const fromUserId = delegate.get(field) as mongoose.Types.ObjectId | null

  if (fromUserId && String(fromUserId) === String(toUserId)) {
    return { assigned: false as const, reason: "already_assigned" as const }
  }

  delegate.set(field, toUserId)
  await delegate.save()

  await AssignmentModel.create({
    delegateId: delegate._id,
    role: input.role,
    fromUserId: fromUserId ?? null,
    toUserId,
    mode,
    reason: input.reason ?? "",
    actorUserId: input.actorUserId ?? null,
  })

  // A pastor needs a session record to have something to mark as seen.
  if (input.role === "pastor") {
    await PastoralSessionModel.updateOne(
      { delegateId: delegate._id, pastorId: toUserId },
      { $setOnInsert: { status: "pending", notes: "" } },
      { upsert: true }
    )
  }

  await logActivity({
    actorUserId: input.actorUserId ?? null,
    action: mode === "auto" ? "delegate.assigned" : "delegate.reassigned",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: {
      role: input.role,
      from: fromUserId ? String(fromUserId) : null,
      to: String(toUserId),
      reason: input.reason ?? "",
    },
  })

  await publishDashboardEvent({
    type: "delegate.assigned",
    delegateId: String(delegate._id),
    toUserId: String(toUserId),
    fullName: delegate.fullName,
  })

  if (notify && input.role === "sub_admin") {
    const [newOwner, previousOwner, accommodation] = await Promise.all([
      UserModel.findById(toUserId).select("name email").lean(),
      fromUserId ? UserModel.findById(fromUserId).select("name email").lean() : null,
      delegate.accommodationId
        ? AccommodationModel.findById(delegate.accommodationId).select("name").lean()
        : null,
    ])

    if (newOwner?.email) {
      const message = delegateAssignedEmail({
        subAdminName: newOwner.name,
        delegateName: delegate.fullName,
        delegateEmail: delegate.email,
        delegatePhone: delegate.phoneNumber,
        accommodationName: accommodation?.name ?? "Not selected",
        totalDue: delegate.totalDue ?? 0,
        delegateId: String(delegate._id),
        reassignedFrom: previousOwner?.name ?? null,
      })
      await trySendEmail({ to: newOwner.email, ...message })
    }

    if (previousOwner?.email && newOwner) {
      const message = delegateUnassignedEmail({
        subAdminName: previousOwner.name,
        delegateName: delegate.fullName,
        newOwnerName: newOwner.name,
        reason: input.reason,
      })
      await trySendEmail({ to: previousOwner.email, ...message })
    }
  }

  return { assigned: true as const, toUserId, fromUserId: fromUserId ?? null, mode }
}

/**
 * Run both passes for a freshly created delegate. Failure to find an assignee
 * is not an error — the delegate simply stays unassigned for an admin to
 * place by hand.
 */
export async function autoAssignNewDelegate(
  delegateId: string | mongoose.Types.ObjectId,
  options: { notify?: boolean } = {}
) {
  const subAdmin = await assignDelegate({
    delegateId,
    role: "sub_admin",
    notify: options.notify,
  })
  const pastor = await assignDelegate({
    delegateId,
    role: "pastor",
    notify: false,
  })

  return { subAdmin, pastor }
}
