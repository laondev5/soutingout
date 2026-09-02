import type { Permission, Role } from "@/lib/constants"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      role: Role
      permissions: Permission[]
    }
  }

  interface User {
    id?: string
    name?: string | null
    email?: string | null
    role: Role
    permissions: Permission[]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string
    role?: Role
    permissions?: Permission[]
  }
}

export {}
