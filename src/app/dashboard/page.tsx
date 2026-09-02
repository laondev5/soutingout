import Link from "next/link"
import { requireUser } from "@/lib/permissions"
import { delegateCounts } from "@/lib/delegates"
import { listAccommodationOptions } from "@/lib/accommodation"
import { formatNaira } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export default async function DashboardPage() {
  const user = await requireUser()
  const [counts, accommodations] = await Promise.all([
    delegateCounts(user),
    user.role === "super_admin" ? listAccommodationOptions({ includeInactive: true }) : [],
  ])

  const collectionRate = counts.expected > 0 ? (counts.collected / counts.expected) * 100 : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.role === "super_admin"
            ? "Every delegate across the retreat."
            : "The delegates assigned to you."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total delegates" value={counts.total} href="/dashboard/delegates" />
        <Stat
          label="Awaiting payment"
          value={counts.pending}
          href="/dashboard/delegates?status=pending"
          tone="warning"
        />
        <Stat
          label="Confirmed"
          value={counts.confirmed}
          href="/dashboard/delegates?status=confirmed"
          tone="success"
        />
        <Stat label="Cancelled" value={counts.cancelled} href="/dashboard/delegates?status=cancelled" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {formatNaira(counts.collected)}
            </span>
            <span className="text-sm text-muted-foreground">
              of {formatNaira(counts.expected)} expected
            </span>
          </div>
          <Progress value={Math.min(100, collectionRate)} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {collectionRate.toFixed(1)}% collected. Outstanding:{" "}
            {formatNaira(Math.max(0, counts.expected - counts.collected))}.
          </p>
        </CardContent>
      </Card>

      {user.role === "super_admin" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accommodation occupancy</CardTitle>
          </CardHeader>
          <CardContent>
            {accommodations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accommodation published yet.{" "}
                <Link href="/dashboard/accommodations" className="underline">
                  Add the first one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-4">
                {accommodations.map((option) => {
                  const rate = option.totalBeds > 0 ? (option.bedsTaken / option.totalBeds) * 100 : 0
                  return (
                    <li key={option.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{option.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {option.bedsTaken} / {option.totalBeds} beds
                        </span>
                      </div>
                      <Progress value={Math.min(100, rate)} className="h-1.5" />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string
  value: number
  href: string
  tone?: "warning" | "success"
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border p-4 transition-colors hover:bg-muted/50"
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          tone === "warning"
            ? "mt-2 text-3xl font-semibold tabular-nums text-amber-600"
            : tone === "success"
              ? "mt-2 text-3xl font-semibold tabular-nums text-emerald-600"
              : "mt-2 text-3xl font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </Link>
  )
}
