import type { Metadata } from "next"
import Link from "next/link"
import { LoginForm } from "@/components/auth/LoginForm"
import { Logo } from "@/components/Logo"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({ searchParams }: PageProps<"/auth/login">) {
  const params = await searchParams
  const next = typeof params.next === "string" ? params.next : undefined
  const passwordSet = params.passwordSet === "1"

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-block">
          <Logo width={56} priority />
        </Link>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For retreat staff — super admins, sub-admins and pastors.
        </p>

        {passwordSet ? (
          <p className="mt-5 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Password set. Sign in with it below.
          </p>
        ) : null}

        <div className="mt-8">
          <LoginForm next={next} />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Looking to register as a delegate?{" "}
          <Link href="/register" className="font-medium text-foreground underline">
            Register here
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
