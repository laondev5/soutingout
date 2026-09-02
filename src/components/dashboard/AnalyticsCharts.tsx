"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
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
      <div className="mt-3 h-56 w-full">
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
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
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
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
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
  return (
    <Frame title="Bed occupancy">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(value: string) => value.split(" ")[0]}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="bedsTaken" fill="var(--primary)" name="Taken" radius={[4, 4, 0, 0]} />
        <Bar dataKey="totalBeds" fill="var(--muted)" name="Total" radius={[4, 4, 0, 0]} />
      </BarChart>
    </Frame>
  )
}
