import { requireRole } from "@/lib/permissions"
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell"

export default async function PastorLayout({ children }: LayoutProps<"/pastor">) {
  const user = await requireRole("pastor")

  const nav: NavItem[] = [
    { href: "/pastor", label: "My delegates", icon: "delegates" },
    { href: "/pastor/seen", label: "Seen", icon: "activity" },
  ]

  return (
    <DashboardShell user={user} nav={nav}>
      {children}
    </DashboardShell>
  )
}
