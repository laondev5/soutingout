"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BedDouble,
  Blocks,
  FormInput,
  ChartNoAxesColumn,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { logout } from "@/actions/auth.actions"
import { LogoLockup } from "@/components/Logo"
import { cn } from "@/lib/utils"
import { ROLE_LABELS, type Role } from "@/lib/constants"

export type NavItem = { href: string; label: string; icon?: NavIcon }

/** Named icons keep the nav definitions serialisable from server components. */
export type NavIcon =
  | "overview"
  | "delegates"
  | "payments"
  | "import"
  | "accommodation"
  | "admins"
  | "pastors"
  | "analytics"
  | "activity"
  | "cms"
  | "formBuilder"

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  delegates: Users,
  payments: CreditCard,
  import: Upload,
  accommodation: BedDouble,
  admins: UserRound,
  pastors: UserRound,
  analytics: ChartNoAxesColumn,
  activity: Activity,
  cms: Blocks,
  formBuilder: FormInput,
}

export function DashboardShell({
  user,
  nav,
  children,
}: {
  user: { name?: string | null; email?: string | null; role: Role }
  nav: NavItem[]
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Routes that lay out their own full-width workspace.
  const wide = pathname.startsWith("/dashboard/cms") || pathname.startsWith("/dashboard/form-builder")
  const [open, setOpen] = useState(false)

  function isActive(href: string) {
    // Exact match for a section root, prefix match for its children, so
    // /dashboard does not stay highlighted on /dashboard/delegates.
    if (pathname === href) return true
    return href !== "/dashboard" && href !== "/pastor" && pathname.startsWith(`${href}/`)
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-5 py-4">
        <Link href={nav[0]?.href ?? "/dashboard"} className="block">
          <LogoLockup subtitle={ROLE_LABELS[user.role]} />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon ? ICONS[item.icon] : null
            const active = isActive(item.href)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  {Icon ? (
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-sidebar-primary" : "opacity-70"
                      )}
                    />
                  ) : null}
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium">{user.name ?? "Signed in"}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-full flex-1">
      {/* Desktop: a permanent column. */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {/* Mobile: the same nav in a slide-over. */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground shadow-xl">
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
          <LogoLockup width={28} />
        </header>

        {/* The builders need every pixel the browser has — a 1280px preview
            inside a 1024px column is not a preview. Everything else stays in
            a readable column. */}
        <main
          className={cn(
            "w-full flex-1 py-8",
            wide ? "px-4" : "mx-auto max-w-5xl px-6"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
