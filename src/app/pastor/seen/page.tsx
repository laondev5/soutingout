import Link from "next/link"
import { requireRole } from "@/lib/permissions"
import { listPastoralDelegates, pastoralCounts } from "@/lib/pastoral"
import { PastoralList } from "@/components/pastor/PastoralList"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function PastorSeenPage({ searchParams }: PageProps<"/pastor/seen">) {
  const user = await requireRole("pastor")
  const params = await searchParams
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1

  const [result, counts] = await Promise.all([
    listPastoralDelegates(user, { status: "seen", page }),
    pastoralCounts(user),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.seen} of {counts.assigned} delegates spoken with.
        </p>
      </div>

      <PastoralList delegates={result.items} />

      {result.pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {result.page} of {result.pages}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={`/pastor/seen?page=${result.page - 1}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link
                href={`/pastor/seen?page=${result.page + 1}`}
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
