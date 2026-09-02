import "server-only"
import mongoose from "mongoose"
import { DelegateModel, PastoralSessionModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import type { SessionUser } from "@/lib/permissions"
import type { PastoralStatus } from "@/lib/constants"

export type PastoralDelegate = {
  id: string
  fullName: string
  email: string
  phoneNumber: string
  whatsappNumber: string
  comingWith: string
  lffId: string | null
  accommodationCode: string | null
  registrationStatus: string
  status: PastoralStatus
  notes: string
  seenAt: string | null
}

const PAGE_SIZE = 24

/**
 * A pastor's caseload. Pastoral status lives in its own collection rather than
 * on the delegate, so two pastors could in principle each record their own
 * session — the list is always filtered to this pastor's own.
 */
export async function listPastoralDelegates(
  user: SessionUser,
  filters: { status?: PastoralStatus | "all"; search?: string; page?: number } = {}
) {
  await connectDB()

  const page = Math.max(1, filters.page ?? 1)
  const pastorId = new mongoose.Types.ObjectId(user.id)

  const query: Record<string, unknown> = {
    assignedPastorId: pastorId,
    registrationStatus: { $ne: "cancelled" },
  }

  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(escaped, "i")
    query.$or = [{ fullName: regex }, { email: regex }, { lffId: regex }]
  }

  // Status lives in another collection, so when it is being filtered on the
  // matching delegate ids are resolved first and folded into the main query.
  if (filters.status && filters.status !== "all") {
    const sessions = await PastoralSessionModel.find({ pastorId, status: filters.status })
      .select("delegateId")
      .lean()

    const ids = sessions.map((session) => session.delegateId)

    if (filters.status === "seen") {
      query._id = { $in: ids }
    } else {
      // "Pending" includes delegates with no session row at all, which is the
      // state everyone starts in.
      query._id = { $nin: await seenIds(pastorId) }
    }
  }

  const [delegates, total] = await Promise.all([
    DelegateModel.find(query)
      .select("fullName email phoneNumber whatsappNumber comingWith lffId accommodationCode registrationStatus")
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    DelegateModel.countDocuments(query),
  ])

  const sessions = await PastoralSessionModel.find({
    pastorId,
    delegateId: { $in: delegates.map((row) => row._id) },
  }).lean()

  const byDelegate = new Map(sessions.map((session) => [String(session.delegateId), session]))

  const items: PastoralDelegate[] = delegates.map((row) => {
    const session = byDelegate.get(String(row._id))

    return {
      id: String(row._id),
      fullName: row.fullName,
      email: row.email,
      phoneNumber: row.phoneNumber ?? "",
      whatsappNumber: row.whatsappNumber ?? "",
      comingWith: row.comingWith ?? "",
      lffId: row.lffId ?? null,
      accommodationCode: row.accommodationCode ?? null,
      registrationStatus: row.registrationStatus,
      status: (session?.status ?? "pending") as PastoralStatus,
      notes: session?.notes ?? "",
      seenAt: session?.seenAt ? session.seenAt.toISOString() : null,
    }
  })

  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE }
}

async function seenIds(pastorId: mongoose.Types.ObjectId) {
  const sessions = await PastoralSessionModel.find({ pastorId, status: "seen" })
    .select("delegateId")
    .lean()
  return sessions.map((session) => session.delegateId)
}

export async function pastoralCounts(user: SessionUser) {
  await connectDB()

  const pastorId = new mongoose.Types.ObjectId(user.id)

  const [assigned, seen] = await Promise.all([
    DelegateModel.countDocuments({
      assignedPastorId: pastorId,
      registrationStatus: { $ne: "cancelled" },
    }),
    PastoralSessionModel.countDocuments({ pastorId, status: "seen" }),
  ])

  return { assigned, seen, pending: Math.max(0, assigned - seen) }
}
