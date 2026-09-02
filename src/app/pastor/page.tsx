import Link from "next/link"
import { requireRole } from "@/lib/permissions"
import { listPastoralDelegates, pastoralCounts } from "@/lib/pastoral"
import { PastoralList } from "@/components/pastor/PastoralList"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function PastorPage({ searchParams }: PageProps<"/pastor">) {
  const user = await requireRole("pastor")
  const params = await searchParams

  const search = typeof params.search === "string" ? params.search : ""
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1

  const [result, counts] = await Promise.all([
    listPastoralDelegates(user, { status: "pending", search, page }),
    pastoralCounts(user),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My delegates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.pending} still to see, {counts.seen} seen, {counts.assigned} assigned to you.
        </p>
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

      <PastoralList delegates={result.items} />

      {result.pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {result.page} of {result.pages}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={`/pastor?page=${result.page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link
                href={`/pastor?page=${result.page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
