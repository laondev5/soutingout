import type { Metadata } from "next"
import Link from "next/link"
import { listAccommodationOptions } from "@/lib/accommodation"
import { RegistrationStepper } from "@/components/registration/RegistrationStepper"
import { EVENT } from "@/lib/constants"
import { LogoLockup } from "@/components/Logo"

export const metadata: Metadata = {
  title: "Register",
}

// Bed availability changes as people register, so never cache this page.
export const dynamic = "force-dynamic"

export default async function RegisterPage() {
  const accommodations = await listAccommodationOptions()

  return (
    <main className="flex-1">
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/">
            <LogoLockup width={32} />
          </Link>
          <Link href="/status" className="text-sm text-muted-foreground underline">
            Check status
          </Link>
        </div>
      </div>

      {accommodations.length === 0 ? (
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Registration is not open yet</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No accommodation options have been published. Please check back shortly, or contact
            us on {EVENT.supportPhone}.
          </p>
        </div>
      ) : (
        <RegistrationStepper accommodations={accommodations} />
      )}
    </main>
  )
}
