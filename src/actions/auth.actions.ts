"use server"

import { AuthError } from "next-auth"
import { signIn, signOut } from "@/auth"
import { homeFor } from "@/lib/permissions"
import { connectDB } from "@/lib/mongoose"
import { UserModel } from "@/lib/db-models"
import type { Role } from "@/lib/constants"

export type LoginResult = { ok: false; error: string } | { ok: true; redirectTo: string }

export async function login(input: { email: string; password: string }): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase()

  if (!email || !input.password) {
    return { ok: false, error: "Enter your email and password." }
  }

  try {
    // NextAuth would redirect on its own; we handle it so the role decides
    // where the user lands.
    await signIn("credentials", { email, password: input.password, redirect: false })
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Incorrect email or password." }
    }
    throw error
  }

  await connectDB()
  const user = await UserModel.findOne({ email }).select("role").lean()

  return { ok: true, redirectTo: homeFor((user?.role ?? "sub_admin") as Role) }
}

export async function logout() {
  await signOut({ redirectTo: "/auth/login" })
}
