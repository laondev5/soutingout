import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { BlockRenderer } from "@/components/cms/BlockRenderer"
import { getSections } from "@/lib/cms"
import { listAccommodationOptions } from "@/lib/accommodation"

// Content and bed counts both come from the database, so render per request.
// The content itself is cached and only refetched when a section is published.
export const dynamic = "force-dynamic"

export default async function HomePage() {
  const [content, accommodations] = await Promise.all([
    getSections(["home.hero", "home.body"]),
    listAccommodationOptions(),
  ])

  const pricing = accommodations.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    pricePerPerson: a.pricePerPerson,
    pricingMode: a.pricingMode,
    isFree: a.isFree,
    bedsAvailable: a.bedsAvailable,
  }))

  return (
    <main className="flex-1">
      <section className="border-b border-emerald-900 bg-emerald-950 text-emerald-50">
        <div className="mx-auto w-full max-w-3xl px-6 py-20">
          <Logo width={72} onDark priority />
          <p className="mt-7 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200/70">
            Registration is open
          </p>

          <BlockRenderer
            blocks={content["home.hero"] ?? []}
            context={{ onDark: true, pricing }}
            className="mt-4 space-y-5"
          />

          {/* The two calls to action stay in code: they are navigation, not
              copy, and losing them from a bad edit would strand delegates. */}
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Register now <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/status"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "border-emerald-800 bg-transparent text-emerald-50 hover:bg-emerald-900 hover:text-white",
              })}
            >
              Check my status
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 py-14">
        <BlockRenderer blocks={content["home.body"] ?? []} context={{ pricing }} className="space-y-5" />

        <div className="mt-10">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>
            Start registration <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <WhatsAppButton />
    </main>
  )
}
