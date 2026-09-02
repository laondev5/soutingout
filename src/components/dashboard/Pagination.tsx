"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PAGE_SIZES } from "@/lib/list-params"

/**
 * The list footer: what you are looking at, how much there is, and how to move
 * through it.
 *
 * Deliberately always rendered, even on a single page. Hiding it when
 * everything fits leaves no visible sign that the list is paginated at all,
 * and no way to change the page size before the list grows.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  label = "results",
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  label?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  function go(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    router.push(`${pathname}?${query}`)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">
        {total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            Showing <span className="font-medium text-foreground tabular-nums">{first}</span>–
            <span className="font-medium text-foreground tabular-nums">{last}</span> of{" "}
            <span className="font-medium text-foreground tabular-nums">{total}</span> {label}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span className="hidden sm:inline">Per page</span>
          <select
            aria-label="Results per page"
            value={pageSize}
            // Changing the size invalidates the current offset, so go back to
            // page 1 rather than landing on an empty page.
            onChange={(event) => go({ perPage: event.target.value, page: "1" })}
            className="h-8 rounded-md border bg-transparent px-1.5 text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) })}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="px-1 tabular-nums text-muted-foreground">
            {page} / {Math.max(1, pages)}
          </span>

          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => go({ page: String(page + 1) })}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

