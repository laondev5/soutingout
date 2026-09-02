import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcryptjs from "bcryptjs"
import { connectDB } from "@/lib/mongoose"
import { UserModel } from "@/lib/db-models"
import { logActivity } from "@/lib/activity-log"
import type { Permission, Role } from "@/lib/constants"

/** Mongoose arrays are not structured-cloneable — copy to a plain array. */
function toPlainPermissions(value: unknown): Permission[] {
  return Array.isArray(value) ? value.map((entry) => String(entry) as Permission) : []
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase()
        const password = String(credentials?.password ?? "")

        if (!email || !password) {
          return null
        }

        await connectDB()
        const user = await UserModel.findOne({ email })

        // Deactivated staff are refused here rather than at the page level, so
        // a revoked account cannot ride an existing sign-in attempt through.
        if (!user || !user.isActive) {
          return null
        }

        const isValid = await bcryptjs.compare(password, user.passwordHash)

        if (!isValid) {
          return null
        }

        user.lastLoginAt = new Date()
        await user.save()

        await logActivity({
          actorUserId: user._id.toString(),
          action: "auth.login",
          entityType: "user",
          entityId: user._id.toString(),
          details: { email: user.email, role: user.role },
        })

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role as Role,
          // Must be a plain array: NextAuth structuredClones the token when
          // encoding the JWT, and a Mongoose document array throws
          // DataCloneError there.
          permissions: toPlainPermissions(user.permissions),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role
        token.permissions = user.permissions
      }

      // Role and permission changes must take effect without forcing a
      // re-login, so re-read them from the database on session refresh.
      if (!user && trigger === "update" && token.sub) {
        await connectDB()
        const fresh = await UserModel.findById(token.sub)
        if (fresh?.isActive) {
          token.role = fresh.role as Role
          token.permissions = toPlainPermissions(fresh.permissions)
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ""
        session.user.role = (token.role ?? "sub_admin") as Role
        session.user.permissions = (token.permissions ?? []) as Permission[]
      }
      return session
    },
  },
})
