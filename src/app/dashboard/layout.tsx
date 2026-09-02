import { requireRole, can } from "@/lib/permissions"
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell"
import { LiveUpdates } from "@/components/dashboard/LiveUpdates"
import { sweepPaymentsInBackground } from "@/lib/reconcile-trigger"

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireRole("super_admin", "sub_admin")

  // Settle pending Paystack payments after this response is sent.
  sweepPaymentsInBackground()

  // Menu mirrors what the proxy allows, so nobody is shown a link that
  // redirects them straight back.
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: "overview" },
    { href: "/dashboard/delegates", label: "Delegates", icon: "delegates" },
  ]

  if (can(user, "payments.view")) {
    nav.push({ href: "/dashboard/payments", label: "Payments", icon: "payments" })
  }

  if (can(user, "delegates.import")) {
    nav.push({ href: "/dashboard/import", label: "Import", icon: "import" })
  }

  if (user.role === "super_admin") {
    nav.push(
      { href: "/dashboard/accommodations", label: "Accommodation", icon: "accommodation" },
      { href: "/dashboard/cms", label: "Page content", icon: "cms" },
      { href: "/dashboard/form-builder", label: "Form builder", icon: "formBuilder" },
      { href: "/dashboard/admins", label: "Sub-admins", icon: "admins" },
      { href: "/dashboard/pastors", label: "Pastors", icon: "pastors" },
      { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
      { href: "/dashboard/activity", label: "Activity", icon: "activity" }
    )
  }

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
