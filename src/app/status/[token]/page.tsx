import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { StatusClient } from "@/components/StatusClient"
import { isPaystackConfigured } from "@/lib/paystack"
import { isCloudinaryConfigured } from "@/lib/cloudinary"
import { getStatusByToken } from "@/actions/status.actions"
import { sweepPaymentsInBackground } from "@/lib/reconcile-trigger"
import { LogoLockup } from "@/components/Logo"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { EVENT } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Your registration",
}

/**
 * A delegate's own, permanent link to their profile — emailed to them at
 * registration and again on payment confirmation, so they never have to
 * type their email or LFF ID to come back.
 */
export default async function StatusTokenPage({
  params,
}: PageProps<"/status/[token]">) {
  const { token } = await params

  const result = await getStatusByToken(token)
  if (!result.ok) {
    notFound()
  }

  sweepPaymentsInBackground()

  return (
    <main className="flex-1 cms-canvas">
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/">
            <LogoLockup width={32} />
          </Link>
          <Link href="/register" className="text-sm text-muted-foreground underline">
            Register
          </Link>
        </div>
      </div>

      <div className="px-6 pt-10 pb-28">
        <StatusClient
          paystackEnabled={isPaystackConfigured()}
          uploadsEnabled={isCloudinaryConfigured()}
          initialDelegate={result.delegate}
        />
      </div>

      <WhatsAppButton
        message={`Hello, I need help with my ${EVENT.shortName} registration or payment.`}
      />
    </main>
  )
}
