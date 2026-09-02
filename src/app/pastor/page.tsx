import Link from "next/link"
import { requireRole } from "@/lib/permissions"
import { listPastoralDelegates, pastoralCounts } from "@/lib/pastoral"
import { PastoralList } from "@/components/pastor/PastoralList"
import { Pagination } from "@/components/dashboard/Pagination"
import { readPageSize } from "@/lib/list-params"
import { ViewToggle } from "@/components/dashboard/ViewToggle"
import { readView } from "@/lib/list-params"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function PastorPage({ searchParams }: PageProps<"/pastor">) {
  const user = await requireRole("pastor")
  const params = await searchParams

  const search = typeof params.search === "string" ? params.search : ""
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1
  const pageSize = readPageSize(params.perPage)
  const view = readView(params.view)

  const [result, counts] = await Promise.all([
    listPastoralDelegates(user, { status: "pending", search, page, pageSize }),
    pastoralCounts(user),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">My delegates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.pending} still to see, {counts.seen} seen, {counts.assigned} assigned to you.
          </p>
        </div>
        <ViewToggle view={view} />
      </div>

      <form className="flex flex-wrap gap-2" action="/pastor">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search by name, email or LFF ID"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {search ? (
          <Link href="/pastor" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        ) : null}
      </form>

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
