import { ActivityLogModel, UserModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/dashboard/Pagination"
import { readPageSize } from "@/lib/list-params"

export const dynamic = "force-dynamic"


export default async function ActivityPage({ searchParams }: PageProps<"/dashboard/activity">) {
  await requireSuperAdmin()
  await connectDB()

  const params = await searchParams
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1)
  const PAGE_SIZE = readPageSize(params.perPage)

  const [entries, total] = await Promise.all([
    ActivityLogModel.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    ActivityLogModel.estimatedDocumentCount(),
  ])

  const actorIds = [...new Set(entries.map((e) => e.actorUserId).filter(Boolean).map(String))]
  const actors = await UserModel.find({ _id: { $in: actorIds } }).select("name").lean()
  const names = new Map(actors.map((actor) => [String(actor._id), actor.name]))

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every assignment, payment and import, newest first.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing logged yet.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {entries.map((entry) => (
            <li key={String(entry._id)} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
              <Badge variant="outline" className="font-mono text-xs">
                {entry.action}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {entry.actorUserId ? (names.get(String(entry.actorUserId)) ?? "Unknown") : "System"}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
              </span>
              {Object.keys(entry.details ?? {}).length > 0 ? (
                <p className="w-full truncate font-mono text-xs text-muted-foreground">
                  {JSON.stringify(entry.details)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} pages={pages} total={total} pageSize={PAGE_SIZE} label="entries" />
    </div>
  )
}
