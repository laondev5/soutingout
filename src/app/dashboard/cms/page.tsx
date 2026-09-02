import { requireSuperAdmin } from "@/lib/permissions"
import { getEditableSection } from "@/lib/cms"
import { listAccommodationOptions } from "@/lib/accommodation"
import { CMS_SECTIONS, CMS_SECTION_SLUGS, isSectionSlug } from "@/lib/cms-blocks"
import { CmsPageClient } from "@/components/cms/CmsPageClient"

export const dynamic = "force-dynamic"

export default async function CmsPage({ searchParams }: PageProps<"/dashboard/cms">) {
  await requireSuperAdmin()

  const params = await searchParams
  const requested = typeof params.section === "string" ? params.section : ""
  const activeSlug = isSectionSlug(requested) ? requested : CMS_SECTIONS[0].slug

  const [section, accommodations] = await Promise.all([
    getEditableSection(activeSlug),
    listAccommodationOptions(),
  ])

  return (
    <CmsPageClient
      sections={CMS_SECTIONS.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        description: entry.description,
        onDark: "onDark" in entry ? entry.onDark : false,
      }))}
      activeSlug={activeSlug}
      blocks={section.blocks}
      hasDraft={section.hasDraft}
      publishedAt={section.publishedAt}
      pricing={accommodations.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        pricePerPerson: a.pricePerPerson,
        pricingMode: a.pricingMode,
        isFree: a.isFree,
        bedsAvailable: a.bedsAvailable,
      }))}
    />
  )
}
