"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { CmsEditor, type SectionOption } from "@/components/cms/CmsEditor"
import type { PricingRow } from "@/components/cms/BlockRenderer"
import type { Block } from "@/lib/cms-blocks"

/**
 * Keeps the chosen section in the URL, so the editor survives a refresh and a
 * section can be linked to directly. The server component re-runs on the query
 * change and hands down that section's blocks.
 */
export function CmsPageClient({
  sections,
  activeSlug,
  blocks,
  hasDraft,
  publishedAt,
  pricing,
}: {
  sections: SectionOption[]
  activeSlug: string
  blocks: Block[]
  hasDraft: boolean
  publishedAt: string | null
  pricing: PricingRow[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function select(slug: string) {
    const next = new URLSearchParams(params.toString())
    next.set("section", slug)
    router.push(`/dashboard/cms?${next}`)
  }

  return (
    <CmsEditor
      key={activeSlug}
      sections={sections}
      activeSlug={activeSlug}
      initialBlocks={blocks}
      hasDraft={hasDraft}
      publishedAt={publishedAt}
      pricing={pricing}
      onSelectSection={select}
    />
  )
}
