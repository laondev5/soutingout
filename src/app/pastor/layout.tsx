import { requireRole } from "@/lib/permissions"
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell"
import { LiveUpdates } from "@/components/dashboard/LiveUpdates"
import { sweepPaymentsInBackground } from "@/lib/reconcile-trigger"

export default async function PastorLayout({ children }: LayoutProps<"/pastor">) {
  const user = await requireRole("pastor")

  // Settle pending Paystack payments after this response is sent.
  sweepPaymentsInBackground()

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
