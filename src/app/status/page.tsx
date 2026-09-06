import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { StatusClient } from "@/components/StatusClient"
import { isPaystackConfigured } from "@/lib/paystack"
import { isCloudinaryConfigured } from "@/lib/cloudinary"
import { reconcileOne } from "@/lib/reconcile"
import { sweepPaymentsInBackground } from "@/lib/reconcile-trigger"
import { PaymentModel, DelegateModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { generateStatusToken } from "@/lib/status-token"
import { LogoLockup } from "@/components/Logo"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { COUNSELING_FORM_URL, EVENT } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Check your status",
}

export default async function StatusPage({ searchParams }: PageProps<"/status">) {
  const params = await searchParams
  const reference = typeof params.reference === "string" ? params.reference : undefined

  // Paystack sends the delegate back here with their reference. Settle that
  // one before rendering. A payment that just confirmed sends them straight
  // on to the counseling form, as requested — everything else (still
  // pending, failed, or an old reference for an already-paid delegate) sends
  // them to their own profile instead, since typing an email and LFF ID
  // right after paying would be a step backwards.
  if (reference) {
    await reconcileOne(reference)

    await connectDB()
    const payment = await PaymentModel.findOne({ reference }).select("delegateId")

    if (payment) {
      const delegate = await DelegateModel.findById(payment.delegateId).select(
        "statusToken registrationStatus"
      )

      if (delegate) {
        const token = delegate.statusToken ?? generateStatusToken()
        if (!delegate.statusToken) {
          await DelegateModel.updateOne({ _id: delegate._id }, { $set: { statusToken: token } })
        }

        if (delegate.registrationStatus === "confirmed") {
          redirect(COUNSELING_FORM_URL)
        }

        redirect(`/status/${token}`)
      }
    }
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
