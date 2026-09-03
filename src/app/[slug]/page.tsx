import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { SectionRenderer } from "@/components/cms/SectionRenderer"
import { SiteHeader } from "@/components/SiteHeader"
import { SiteFooter } from "@/components/SiteFooter"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { getNavPages, getPublishedPage } from "@/lib/cms"
import { listAccommodationOptions } from "@/lib/accommodation"

/**
 * Pages the super admin builds, served from the root: `/about`, not
 * `/pages/about`.
 *
 * Next matches static segments first, so `/register` and `/dashboard` are
 * never reached by this route; anything else that has no published page 404s.
 */
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const page = await getPublishedPage(slug)

  if (!page) return {}

  return {
    title: page.title,
    description: page.seoDescription || undefined,
  }
}

export default async function CustomPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params

  const [page, navPages] = await Promise.all([getPublishedPage(slug), getNavPages()])

  if (!page) {
    notFound()
  }

  // Only fetched when the page actually shows live prices — most will not.
  const needsPricing = page.sections.some((section) =>
    section.blocks.some((block) => block.type === "pricingTable")
  )
  const accommodations = needsPricing ? await listAccommodationOptions() : []

  return (
    <>
      <SiteHeader navPages={navPages} activeSlug={slug} />

      <main className="flex-1 cms-canvas">
        <SectionRenderer
          sections={page.sections}
          asCanvas={false}
          context={{
            pricing: accommodations.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              pricePerPerson: a.pricePerPerson,
              pricingMode: a.pricingMode,
              isFree: a.isFree,
              bedsAvailable: a.bedsAvailable,
            })),
          }}
        />
      </main>

      <SiteFooter />
      <WhatsAppButton />
    </>
  )
}
