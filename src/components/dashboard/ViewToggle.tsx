"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LayoutGrid, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ViewMode } from "@/lib/list-params"

/**
 * Switches a list between cards and a table. The choice lives in the URL so it
 * survives a refresh and can be shared, and it is also remembered per page so
 * the next visit opens the way you left it.
 */
export function ViewToggle({ view }: { view: ViewMode }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function select(next: ViewMode) {
    const query = new URLSearchParams(params.toString())
    query.set("view", next)
    try {
      window.localStorage.setItem(`view:${pathname}`, next)
    } catch {
      // Private mode or blocked storage — the URL still carries the choice.
    }
    router.push(`${pathname}?${query}`)
  }

  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex overflow-hidden rounded-lg border"
    >
      {(
        [
          { mode: "cards" as const, label: "Cards", Icon: LayoutGrid },
          { mode: "table" as const, label: "Table", Icon: Table2 },
        ]
      ).map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => select(mode)}
          aria-pressed={view === mode}
          title={`${label} view`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors",
            view === mode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

