import "server-only"
import mongoose from "mongoose"
import { DelegateModel, PaymentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { delegateScope, type SessionUser } from "@/lib/permissions"
import type { PaymentStatus } from "@/lib/constants"

export type PaymentListItem = {
  id: string
  reference: string
  provider: "manual" | "paystack"
  status: PaymentStatus
  amount: number
  receiptUrl: string | null
  note: string
  attempts: number
  lastError: string | null
  createdAt: string
  verifiedAt: string | null
  delegate: {
    id: string
    fullName: string
    email: string
    lffId: string | null
    totalDue: number
    totalPaid: number
  } | null
}

/**
 * Payments are scoped through their delegate, not directly — a sub-admin sees
 * a payment only if they can see the person who made it.
 */
export async function listPayments(
  user: SessionUser,
  filters: { status?: PaymentStatus | "all"; page?: number; pageSize?: number } = {}
) {
  await connectDB()

  const perPage = Math.min(100, Math.max(1, filters.pageSize ?? 25))
  const page = Math.max(1, filters.page ?? 1)

  const scope = delegateScope(user)
  const scopedIds =
    user.role === "super_admin"
      ? null
      : (await DelegateModel.find(scope).select("_id").lean()).map((row) => row._id)

  const query: Record<string, unknown> = {}
  if (scopedIds) query.delegateId = { $in: scopedIds }
  if (filters.status && filters.status !== "all") query.status = filters.status

  const [rows, total] = await Promise.all([
    PaymentModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    PaymentModel.countDocuments(query),
  ])

  const delegateIds = rows.map((row) => row.delegateId).filter(Boolean)
  const delegates = await DelegateModel.find({ _id: { $in: delegateIds } })
    .select("fullName email lffId totalDue totalPaid")
    .lean()

  const byId = new Map(delegates.map((d) => [String(d._id), d]))

  const items: PaymentListItem[] = rows.map((row) => {
    const delegate = byId.get(String(row.delegateId))

    return {
      id: String(row._id),
      reference: row.reference,
      provider: row.provider,
      status: row.status,
      amount: row.amount,
      receiptUrl: row.receiptUrl ?? null,
      note: row.note ?? "",
      attempts: row.attempts ?? 0,
      lastError: row.lastError ?? null,
      createdAt: (row.createdAt ?? new Date()).toISOString(),
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      delegate: delegate
        ? {
            id: String(delegate._id),
            fullName: delegate.fullName,
            email: delegate.email,
            lffId: delegate.lffId ?? null,
            totalDue: delegate.totalDue ?? 0,
            totalPaid: delegate.totalPaid ?? 0,
          }
        : null,
    }
  })

  return { items, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) }
}

/** Counts for the filter tabs, within the caller's scope. */
export async function paymentCounts(user: SessionUser) {
  await connectDB()

  const scopedIds =
    user.role === "super_admin"
      ? null
      : (await DelegateModel.find(delegateScope(user)).select("_id").lean()).map((r) => r._id)

  const match: Record<string, unknown> = {}
  if (scopedIds) match.delegateId = { $in: scopedIds }

  const rows = await PaymentModel.aggregate<{ _id: PaymentStatus; count: number }>([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ])

  const counts = { pending: 0, submitted: 0, confirmed: 0, failed: 0, all: 0 }

  for (const row of rows) {
    counts[row._id] = row.count
    counts.all += row.count
  }

  return counts
}

/** Delegates who still owe money — the "chase these people" list. */
export async function outstandingBalance(user: SessionUser) {
  await connectDB()

  const [row] = await DelegateModel.aggregate<{ due: number; paid: number; count: number }>([
    { $match: { ...delegateScope(user), registrationStatus: { $ne: "cancelled" } } },
    {
      $group: {
        _id: null,
        due: { $sum: "$totalDue" },
        paid: { $sum: "$totalPaid" },
        count: { $sum: 1 },
      },
    },
  ])

  return {
    due: row?.due ?? 0,
    paid: row?.paid ?? 0,
    outstanding: Math.max(0, (row?.due ?? 0) - (row?.paid ?? 0)),
    delegates: row?.count ?? 0,
  }
}

export function toObjectId(value: string) {
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
}
