import { requireSuperAdmin } from "@/lib/permissions"
import { getEditablePage, getEditableSection, listPages } from "@/lib/cms"
import { listAccommodationOptions } from "@/lib/accommodation"
import { CMS_SECTIONS, isSectionSlug } from "@/lib/cms-blocks"
import { CmsWorkspace } from "@/components/cms/CmsWorkspace"

export const dynamic = "force-dynamic"

export default async function CmsPage({ searchParams }: PageProps<"/dashboard/cms">) {
  await requireSuperAdmin()

  const params = await searchParams
  const requestedKind = params.kind === "page" ? "page" : "slot"
  const requestedId = typeof params.id === "string" ? params.id : ""

  const [pages, accommodations] = await Promise.all([listPages(), listAccommodationOptions()])

  // A page id that no longer exists (deleted in another tab, or a stale link)
  // falls back to the first built-in slot rather than erroring.
  const page =
    requestedKind === "page" && requestedId ? await getEditablePage(requestedId) : null

  const kind = page ? "page" : "slot"
  const slug = isSectionSlug(requestedId) ? requestedId : CMS_SECTIONS[0].slug
  const slot = kind === "slot" ? await getEditableSection(slug) : null

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit what delegates see, or build new pages. Nothing goes live until you publish.
        </p>
      </div>

      <CmsWorkspace
        slots={CMS_SECTIONS.map((entry) => ({
          slug: entry.slug,
          name: entry.name,
          description: entry.description,
          onDark: "onDark" in entry ? entry.onDark : false,
        }))}
        pages={pages}
        activeKind={kind}
        activeId={page ? page.id : slug}
        sections={page ? page.sections : (slot?.sections ?? [])}
        hasDraft={page ? page.hasDraft : (slot?.hasDraft ?? false)}
        publishedAt={page ? page.publishedAt : (slot?.publishedAt ?? null)}
        pageMeta={
          page
            ? {
                id: page.id,
                slug: page.slug,
                title: page.title,
                navLabel: page.navLabel,
                showInNav: page.showInNav,
                navOrder: page.navOrder,
                seoDescription: page.seoDescription,
                isPublished: page.isPublished,
              }
            : null
        }
        pricing={pricing}
      />
    </div>
  )
}
