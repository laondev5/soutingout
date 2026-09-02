import { requireSuperAdmin } from "@/lib/permissions"
import { analyticsSnapshot } from "@/lib/analytics"
import { formatNaira } from "@/lib/constants"
import { RegistrationsChart, OccupancyChart } from "@/components/dashboard/AnalyticsCharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function AnalyticsPage() {
  await requireSuperAdmin()
  const data = await analyticsSnapshot()

  const stats = [
    { label: "Delegates", value: String(data.totals.delegates) },
    { label: "Confirmed", value: String(data.totals.confirmed) },
    { label: "Received", value: formatNaira(data.totals.revenue) },
    { label: "Outstanding", value: formatNaira(data.totals.outstanding) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Refreshed every minute.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <RegistrationsChart data={data.registrationsByDay} />
        <OccupancyChart data={data.byAccommodation} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Accommodation</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Delegates</TableHead>
                <TableHead className="text-right">Beds</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byAccommodation.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.delegates}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.bedsTaken} / {row.totalBeds}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNaira(row.revenue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Sub-admin load</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sub-admin</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bySubAdmin.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.delegates}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.confirmed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Pastoral coverage</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pastor</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pastoral.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.assigned}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.seen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  )
}
