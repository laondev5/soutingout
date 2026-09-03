"use client"

import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

const ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

const JUSTIFY: Record<string, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
}

/** One second of wall clock, shared by every countdown on the page. */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 1000)
  return () => clearInterval(timer)
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function remaining(target: string, now: number) {
  const at = Date.parse(`${target}T00:00:00`)
  if (Number.isNaN(at)) return null

  const ms = Math.max(0, at - now * 1000)

  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    done: ms === 0,
  }
}

/**
 * A live countdown to a date.
 *
 * The clock is read through `useSyncExternalStore` rather than an effect: the
 * server snapshot is `null`, so the markup it renders and the markup the
 * browser first renders agree, and only the second render — after hydration —
 * shows real numbers. Reading `Date.now()` during render would report a
 * hydration mismatch on every page carrying one.
 */
export function Countdown({
  target,
  heading,
  align = "center",
}: {
  target: string
  heading?: string
  align?: string
}) {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => null)
  const left = now === null ? null : remaining(target, now)

  const parts: { value: number; label: string }[] = left
    ? [
        { value: left.days, label: "days" },
        { value: left.hours, label: "hours" },
        { value: left.minutes, label: "minutes" },
        { value: left.seconds, label: "seconds" },
      ]
    : []

  return (
    <div className={ALIGN[align] ?? "text-center"}>
      {heading ? <p className="text-sm font-medium">{heading}</p> : null}

      <div
        className={cn("mt-3 flex flex-wrap gap-3", JUSTIFY[align] ?? "justify-center")}
        // Reserves the row's height before the first tick, so the page does
        // not jump when the numbers arrive.
        style={{ minHeight: 72 }}
      >
        {left?.done ? (
          <p className="text-lg font-semibold">It has begun.</p>
        ) : (
          parts.map((part) => (
            <div
              key={part.label}
              className="min-w-16 rounded-xl border px-3 py-2 text-center"
            >
              <p className="text-2xl font-semibold tabular-nums">
                {String(part.value).padStart(2, "0")}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {part.label}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
