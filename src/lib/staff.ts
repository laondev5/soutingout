import "server-only"
import { DelegateModel, UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import type { StaffRow } from "@/components/dashboard/StaffManager"

/** Staff of one role, with their current open delegate load. */
export async function listStaff(role: "sub_admin" | "pastor"): Promise<StaffRow[]> {
  await connectDB()

  const users = await UserModel.find({ role }).sort({ name: 1 }).lean()

  if (users.length === 0) return []

  const field = role === "pastor" ? "assignedPastorId" : "assignedSubAdminId"

  const counts = await DelegateModel.aggregate<{ _id: unknown; count: number }>([
    {
      $match: {
        [field]: { $in: users.map((u) => u._id) },
        registrationStatus: { $ne: "cancelled" },
      },
    },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ])

  const loadByUser = new Map(counts.map((row) => [String(row._id), row.count]))

  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    maxDelegates: user.maxDelegates ?? 0,
    delegateCount: loadByUser.get(String(user._id)) ?? 0,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  }))
}
