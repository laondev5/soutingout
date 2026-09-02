import { redirect } from "next/navigation"
import { ImportBatchModel, UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, requireUser } from "@/lib/permissions"
import { ImportClient, type ImportBatchSummary } from "@/components/dashboard/ImportClient"

export const dynamic = "force-dynamic"

export default async function ImportPage() {
  const user = await requireUser()

  if (!can(user, "delegates.import")) {
    redirect("/dashboard")
  }

  await connectDB()

  // A sub-admin only ever sees their own imports; a super admin sees all.
  const historyFilter = user.role === "super_admin" ? {} : { actorUserId: user.id }

  const [batches, subAdmins] = await Promise.all([
    ImportBatchModel.find(historyFilter).sort({ createdAt: -1 }).limit(10).lean(),
    user.role === "super_admin"
      ? UserModel.find({ role: "sub_admin", isActive: true }).select("name").sort({ name: 1 }).lean()
      : Promise.resolve([]),
  ])

  const actorIds = [...new Set(batches.map((batch) => String(batch.actorUserId)))]
  const actors = await UserModel.find({ _id: { $in: actorIds } }).select("name").lean()
  const actorNames = new Map(actors.map((actor) => [String(actor._id), actor.name]))

  const history: ImportBatchSummary[] = batches.map((batch) => ({
    id: String(batch._id),
    sourceType: batch.sourceType,
    sourceLabel: batch.sourceLabel ?? "",
    rowsImported: batch.rowsImported ?? 0,
    rowsTotal: batch.rowsTotal ?? 0,
    createdAt: (batch.createdAt ?? new Date()).toISOString(),
    actorName: actorNames.get(String(batch.actorUserId)) ?? "Unknown",
    rolledBack: Boolean(batch.rolledBackAt),
  }))

  return (
    <ImportClient
      canForceAssign={user.role === "super_admin"}
      subAdmins={subAdmins.map((admin) => ({ id: String(admin._id), name: admin.name }))}
      history={history}
      ownName={user.name ?? "you"}
    />
  )
}
