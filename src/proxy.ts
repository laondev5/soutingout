import { NextResponse } from "next/server"
import { auth } from "@/auth"

/** Reachable without a session. Everything else under the matcher needs one. */
const PUBLIC_PATHS = ["/", "/register", "/status", "/auth/login"]

/** Route prefix → roles allowed to open it. */
const ROLE_GATES: { prefix: string; roles: string[] }[] = [
  { prefix: "/dashboard/admins", roles: ["super_admin"] },
  { prefix: "/dashboard/pastors", roles: ["super_admin"] },
  { prefix: "/dashboard/accommodations", roles: ["super_admin"] },
  { prefix: "/dashboard/activity", roles: ["super_admin"] },
  { prefix: "/dashboard/analytics", roles: ["super_admin"] },
  { prefix: "/dashboard", roles: ["super_admin", "sub_admin"] },
  { prefix: "/pastor", roles: ["pastor"] },
]

function homeFor(role?: string) {
  return role === "pastor" ? "/pastor" : "/dashboard"
}

export const proxy = auth((req) => {
  const pathname = req.nextUrl.pathname
  const user = req.auth?.user
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )

  if (user && pathname === "/auth/login") {
    return NextResponse.redirect(new URL(homeFor(user.role), req.nextUrl))
  }

  if (isPublic) {
    return NextResponse.next()
  }

  if (!user) {
    const login = new URL("/auth/login", req.nextUrl)
    login.searchParams.set("next", pathname)
    return NextResponse.redirect(login)
  }

  // First matching prefix wins, so the specific super-admin-only sections are
  // listed above the general /dashboard entry.
  const gate = ROLE_GATES.find((entry) => pathname.startsWith(entry.prefix))

  if (gate && !gate.roles.includes(user.role)) {
    return NextResponse.redirect(new URL(homeFor(user.role), req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)"],
}
