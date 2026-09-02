import type { Metadata } from "next"
import Link from "next/link"
import { StatusClient } from "@/components/StatusClient"
import { isPaystackConfigured } from "@/lib/paystack"
import { isCloudinaryConfigured } from "@/lib/cloudinary"
import { LogoLockup } from "@/components/Logo"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { EVENT } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Check your status",
}

export default async function StatusPage({ searchParams }: PageProps<"/status">) {
  const params = await searchParams
  const reference = typeof params.reference === "string" ? params.reference : undefined

  return (
    <main className="flex-1">
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

      <div className="px-6 py-10">
        <StatusClient
          paystackEnabled={isPaystackConfigured()}
          uploadsEnabled={isCloudinaryConfigured()}
          initialReference={reference}
        />
      </div>

      <WhatsAppButton
        message={`Hello, I need help with my ${EVENT.shortName} registration or payment.`}
      />
    </main>
  )
}
