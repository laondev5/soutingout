import { requireRole } from "@/lib/permissions"
import { listPastoralDelegates, pastoralCounts } from "@/lib/pastoral"
import { PastoralList } from "@/components/pastor/PastoralList"
import { Pagination } from "@/components/dashboard/Pagination"
import { readPageSize } from "@/lib/list-params"
import { ViewToggle } from "@/components/dashboard/ViewToggle"
import { readView } from "@/lib/list-params"

export const dynamic = "force-dynamic"

export default async function PastorSeenPage({ searchParams }: PageProps<"/pastor/seen">) {
  const user = await requireRole("pastor")
  const params = await searchParams
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1
  const pageSize = readPageSize(params.perPage)
  const view = readView(params.view)

  const [result, counts] = await Promise.all([
    listPastoralDelegates(user, { status: "seen", page, pageSize }),
    pastoralCounts(user),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.seen} of {counts.assigned} delegates spoken with.
          </p>
        </div>
        <ViewToggle view={view} />
      </div>

      <PastoralList delegates={result.items} view={view} />

      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={result.pageSize}
        label="delegates"
      />
    </div>
  )
}
