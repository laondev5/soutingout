import "server-only"
import { unstable_cache } from "next/cache"
import {
  AccommodationModel,
  DelegateModel,
  PastoralSessionModel,
  PaymentModel,
  UserModel,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"

export type AnalyticsSnapshot = {
  totals: {
    delegates: number
    confirmed: number
    pending: number
    cancelled: number
    revenue: number
    expected: number
    outstanding: number
  }
  registrationsByDay: { date: string; count: number }[]
  byAccommodation: {
    name: string
    delegates: number
    bedsTaken: number
    totalBeds: number
    revenue: number
  }[]
  bySubAdmin: { name: string; delegates: number; confirmed: number }[]
  pastoral: { name: string; assigned: number; seen: number }[]
}

async function build(): Promise<AnalyticsSnapshot> {
  await connectDB()

  const [statusRows, revenueRow, accommodations, delegatesByAccommodation, staff, sessions, daily] =
    await Promise.all([
      DelegateModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$registrationStatus", count: { $sum: 1 } } },
      ]),
      DelegateModel.aggregate<{ due: number; paid: number }>([
        { $match: { registrationStatus: { $ne: "cancelled" } } },
        { $group: { _id: null, due: { $sum: "$totalDue" }, paid: { $sum: "$totalPaid" } } },
      ]),
      AccommodationModel.find({}).select("name totalBeds bedsReserved").sort({ sortOrder: 1 }).lean(),
      DelegateModel.aggregate<{ _id: unknown; count: number; paid: number }>([
        { $match: { registrationStatus: { $ne: "cancelled" } } },
        {
          $group: {
            _id: "$accommodationId",
            count: { $sum: 1 },
            paid: { $sum: "$totalPaid" },
          },
        },
      ]),
      UserModel.find({ role: { $in: ["sub_admin", "pastor"] }, isActive: true })
        .select("name role")
        .lean(),
      PastoralSessionModel.aggregate<{ _id: unknown; seen: number }>([
        { $match: { status: "seen" } },
        { $group: { _id: "$pastorId", seen: { $sum: 1 } } },
      ]),
      // Last 30 days of registrations, grouped in the database rather than in
      // JS so the whole collection never has to be loaded.
      DelegateModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

  const statuses = Object.fromEntries(statusRows.map((row) => [row._id, row.count]))
  const due = revenueRow[0]?.due ?? 0
  const paid = revenueRow[0]?.paid ?? 0

  const perAccommodation = new Map(
    delegatesByAccommodation.map((row) => [String(row._id), row])
  )

  const assignedCounts = await DelegateModel.aggregate<{
    _id: unknown
    count: number
    confirmed: number
  }>([
    { $match: { assignedSubAdminId: { $ne: null } } },
    {
      $group: {
        _id: "$assignedSubAdminId",
        count: { $sum: 1 },
        confirmed: {
          $sum: { $cond: [{ $eq: ["$registrationStatus", "confirmed"] }, 1, 0] },
        },
      },
    },
  ])

  const pastorAssigned = await DelegateModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { assignedPastorId: { $ne: null } } },
    { $group: { _id: "$assignedPastorId", count: { $sum: 1 } } },
  ])

  const assignedById = new Map(assignedCounts.map((row) => [String(row._id), row]))
  const pastorById = new Map(pastorAssigned.map((row) => [String(row._id), row.count]))
  const seenById = new Map(sessions.map((row) => [String(row._id), row.seen]))

  return {
    totals: {
      delegates: statusRows.reduce((sum, row) => sum + row.count, 0),
      confirmed: statuses.confirmed ?? 0,
      pending: statuses.pending ?? 0,
      cancelled: statuses.cancelled ?? 0,
      revenue: paid,
      expected: due,
      outstanding: Math.max(0, due - paid),
    },
    registrationsByDay: daily.map((row) => ({ date: row._id, count: row.count })),
    byAccommodation: accommodations.map((accommodation) => {
      const row = perAccommodation.get(String(accommodation._id))
      return {
        name: accommodation.name,
        delegates: row?.count ?? 0,
        bedsTaken: accommodation.bedsReserved ?? 0,
        totalBeds: accommodation.totalBeds,
        revenue: row?.paid ?? 0,
      }
    }),
    bySubAdmin: staff
      .filter((member) => member.role === "sub_admin")
      .map((member) => {
        const row = assignedById.get(String(member._id))
        return {
          name: member.name,
          delegates: row?.count ?? 0,
          confirmed: row?.confirmed ?? 0,
        }
      })
      .sort((a, b) => b.delegates - a.delegates),
    pastoral: staff
      .filter((member) => member.role === "pastor")
      .map((member) => ({
        name: member.name,
        assigned: pastorById.get(String(member._id)) ?? 0,
        seen: seenById.get(String(member._id)) ?? 0,
      }))
      .sort((a, b) => b.assigned - a.assigned),
  }
}

/**
 * Analytics runs nine aggregations, so it is cached for a minute. Everything
 * operational — delegate lists, the payment queue — stays uncached and live;
 * only this overview tolerates being a little behind.
 */
export const analyticsSnapshot = unstable_cache(build, ["analytics-snapshot"], {
  revalidate: 60,
  tags: ["analytics"],
})

export async function paymentMethodSplit() {
  await connectDB()

  const rows = await PaymentModel.aggregate<{ _id: string; count: number; amount: number }>([
    { $match: { status: "confirmed" } },
    { $group: { _id: "$provider", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ])

  return rows.map((row) => ({ provider: row._id, count: row.count, amount: row.amount }))
}
