import type { Metadata } from "next"
import Link from "next/link"
import { SetPasswordForm } from "@/components/auth/SetPasswordForm"
import { Logo } from "@/components/Logo"
import { checkPasswordSetupToken } from "@/actions/password.actions"

export const metadata: Metadata = {
  title: "Set your password",
}

/**
 * Where a staff member redeems the one-time link emailed to them when their
 * account is created, or when a super admin resets it.
 *
 * The token is checked here first so an expired or spent link says so before
 * anyone types a password — and so the page can greet them by name.
 */
export default async function SetPasswordPage({
  params,
}: PageProps<"/auth/set-password/[token]">) {
  const { token } = await params
  const result = await checkPasswordSetupToken(token)

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-block">
          <Logo width={56} priority />
        </Link>

        {result.ok ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Set your password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome, {result.name}. Choose a password for your {result.roleLabel} account (
              {result.email}).
            </p>

            <div className="mt-8">
              <SetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Link expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>

            <Link
              href="/auth/login"
              className="mt-8 inline-block text-sm font-medium text-foreground underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
