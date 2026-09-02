"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" }

/** Recharts needs a measured parent, so every chart sits in a fixed-height box. */
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function RegistrationsChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <Frame title="Registrations, last 30 days">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => value.slice(5)}
          minTickGap={24}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          name="Registrations"
        />
      </LineChart>
    </Frame>
  )
}

export function OccupancyChart({
  data,
}: {
  data: { name: string; bedsTaken: number; totalBeds: number }[]
}) {
  // Taken and free are stacked so each bar is the tier's full capacity. Plotting
  // taken against total side by side hides early bookings entirely — one bed out
  // of four hundred is invisible next to a four-hundred bar.
  const stacked = data.map((row) => ({
    name: row.name,
    taken: row.bedsTaken,
    free: Math.max(0, row.totalBeds - row.bedsTaken),
  }))

  return (
    <Frame title="Bed occupancy">
      <BarChart data={stacked} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(value: string) => value.split(" ")[0]}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          iconSize={8}
          verticalAlign="bottom"
        />
        <Bar dataKey="taken" stackId="beds" fill="var(--chart-1)" name="Taken" />
        <Bar
          dataKey="free"
          stackId="beds"
          fill="var(--chart-1)"
          fillOpacity={0.15}
          name="Free"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </Frame>
  )
}
