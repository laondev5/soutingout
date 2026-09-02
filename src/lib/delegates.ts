import "server-only"
import mongoose, { type QueryFilter } from "mongoose"
import { AccommodationModel, DelegateModel, UserModel, type IDelegate } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { delegateScope, type SessionUser } from "@/lib/permissions"
import type { RegistrationStatus } from "@/lib/constants"

export type DelegateListItem = {
  id: string
  fullName: string
  email: string
  phoneNumber: string
  whatsappNumber: string
  comingWith: string
  partySize: number
  lffId: string | null
  accommodationCode: string | null
  accommodationName: string | null
  registrationStatus: RegistrationStatus
  totalDue: number
  totalPaid: number
  balance: number
  assignedSubAdminName: string | null
  assignedPastorName: string | null
  createdAt: string
}

export type DelegateFilters = {
  search?: string
  status?: RegistrationStatus | "all"
  accommodationId?: string
  subAdminId?: string
  unassigned?: boolean
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 25

/** Escape user input before it reaches a regex, so a stray `(` cannot throw. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildFilter(user: SessionUser, filters: DelegateFilters): QueryFilter<IDelegate> {
  const filter: QueryFilter<IDelegate> = { ...delegateScope(user) }

  if (filters.status && filters.status !== "all") {
    filter.registrationStatus = filters.status
  }

  if (filters.accommodationId) {
    filter.accommodationId = new mongoose.Types.ObjectId(filters.accommodationId)
  }

  // Only a super admin can narrow by owner; for anyone else the scope above
  // has already pinned the query to their own delegates.
  if (user.role === "super_admin") {
    if (filters.unassigned) {
      filter.assignedSubAdminId = null
    } else if (filters.subAdminId) {
      filter.assignedSubAdminId = new mongoose.Types.ObjectId(filters.subAdminId)
    }
  }

  const search = filters.search?.trim()
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i")
    filter.$or = [
      { fullName: pattern },
      { email: pattern },
      { phoneNumber: pattern },
      { whatsappNumber: pattern },
      { lffId: pattern },
      { accommodationCode: pattern },
    ]
  }

  return filter
}

export async function listDelegates(user: SessionUser, filters: DelegateFilters = {}) {
  await connectDB()

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, filters.pageSize ?? DEFAULT_PAGE_SIZE)
  const filter = buildFilter(user, filters)

  const [rows, total] = await Promise.all([
    DelegateModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DelegateModel.countDocuments(filter),
  ])

  // Resolve the referenced names in two batched lookups rather than a populate
  // per row.
  const accommodationIds = [...new Set(rows.map((r) => r.accommodationId).filter(Boolean))]
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.assignedSubAdminId, r.assignedPastorId]).filter(Boolean)
    ),
  ]

  const [accommodations, users] = await Promise.all([
    accommodationIds.length
      ? AccommodationModel.find({ _id: { $in: accommodationIds } }).select("name").lean()
      : [],
    userIds.length ? UserModel.find({ _id: { $in: userIds } }).select("name").lean() : [],
  ])

  const accommodationName = new Map(accommodations.map((a) => [String(a._id), a.name]))
  const userName = new Map(users.map((u) => [String(u._id), u.name]))

  const items: DelegateListItem[] = rows.map((row) => ({
    id: String(row._id),
    fullName: row.fullName,
    email: row.email,
    phoneNumber: row.phoneNumber,
    whatsappNumber: row.whatsappNumber,
    comingWith: row.comingWith,
    partySize: 1 + (row.companions?.length ?? 0),
    lffId: row.lffId,
    accommodationCode: row.accommodationCode,
    accommodationName: row.accommodationId
      ? (accommodationName.get(String(row.accommodationId)) ?? null)
      : null,
    registrationStatus: row.registrationStatus,
    totalDue: row.totalDue ?? 0,
    totalPaid: row.totalPaid ?? 0,
    balance: Math.max(0, (row.totalDue ?? 0) - (row.totalPaid ?? 0)),
    assignedSubAdminName: row.assignedSubAdminId
      ? (userName.get(String(row.assignedSubAdminId)) ?? null)
      : null,
    assignedPastorName: row.assignedPastorId
      ? (userName.get(String(row.assignedPastorId)) ?? null)
      : null,
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Fetch one delegate within the caller's scope. Returns null both when the
 * delegate does not exist and when it is out of scope, so an out-of-scope id
 * is indistinguishable from a missing one.
 */
export async function getDelegateInScope(user: SessionUser, id: string) {
  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const delegate = await DelegateModel.findOne({
    _id: new mongoose.Types.ObjectId(id),
    ...delegateScope(user),
  }).lean()

  return delegate
}

export async function delegateCounts(user: SessionUser) {
  await connectDB()

  const scope = delegateScope(user)

  const [byStatus, money] = await Promise.all([
    DelegateModel.aggregate<{ _id: RegistrationStatus; count: number }>([
      { $match: scope },
      { $group: { _id: "$registrationStatus", count: { $sum: 1 } } },
    ]),
    DelegateModel.aggregate<{ _id: null; due: number; paid: number }>([
      { $match: { ...scope, registrationStatus: { $ne: "cancelled" } } },
      { $group: { _id: null, due: { $sum: "$totalDue" }, paid: { $sum: "$totalPaid" } } },
    ]),
  ])

  const counts = new Map(byStatus.map((row) => [row._id, row.count]))

  return {
    pending: counts.get("pending") ?? 0,
    confirmed: counts.get("confirmed") ?? 0,
    cancelled: counts.get("cancelled") ?? 0,
    total: byStatus.reduce((sum, row) => sum + row.count, 0),
    expected: money[0]?.due ?? 0,
    collected: money[0]?.paid ?? 0,
  }
}
