import { requireRole } from "@/lib/permissions"
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell"
import { LiveUpdates } from "@/components/dashboard/LiveUpdates"

export default async function PastorLayout({ children }: LayoutProps<"/pastor">) {
  const user = await requireRole("pastor")

  const nav: NavItem[] = [
    { href: "/pastor", label: "My delegates", icon: "delegates" },
    { href: "/pastor/seen", label: "Seen", icon: "activity" },
  ]

  return (
    <DashboardShell user={user} nav={nav}>
      {/* Live dashboard updates. Renders nothing when Pusher is unconfigured. */}
      <LiveUpdates
        pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY ?? null}
        cluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? null}
        userId={user.id}
      />
      {children}
    </DashboardShell>
  )
}
