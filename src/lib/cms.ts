import "server-only"
import { unstable_cache, updateTag } from "next/cache"
import { SiteContentModel, SitePageModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { EVENT, formatNaira } from "@/lib/constants"
import { toSections, type Block, type Section } from "@/lib/cms-blocks"

const CACHE_TAG = "site-content"
const PAGES_TAG = "site-pages"

/**
 * What each section shows before anyone edits it — the copy that was
 * hard-coded into the pages before the CMS existed. Kept as the fallback so a
 * section that has never been touched still renders, and so "reset to
 * default" has something to reset to.
 */
export const DEFAULT_CONTENT: Record<string, Block[]> = {
  "home.hero": [
    { id: "d1", type: "heading", visible: true, props: { text: EVENT.name, level: "h1", align: "left" } },
    {
      id: "d2",
      type: "paragraph",
      visible: true,
      props: {
        text: "A life-transforming spiritual encounter. Everyone is welcome — whether it is your first time or you have attended before.",
        size: "lg",
        align: "left",
        muted: false,
      },
    },
    {
      id: "d3",
      type: "factGrid",
      visible: true,
      props: {
        columns: 3,
        items: [
          { label: "Date", value: EVENT.dateLabel },
          { label: "Venue", value: EVENT.venue },
          { label: "Host", value: EVENT.host },
        ],
      },
    },
  ],

  "home.body": [
    { id: "d1", type: "heading", visible: true, props: { text: "Before you register", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "list",
      visible: true,
      props: {
        ordered: false,
        items: [
          `General registration, which includes hostel accommodation, is ${formatNaira(35_000)}. Other accommodation options and rates are shown during registration.`,
          "Every cost covers registration, feeding and accommodation for the full duration of the retreat.",
          "Installment payments are accepted, but the full amount must be paid before the retreat.",
          "Accommodation is reserved only once your payment is confirmed. Allocation is first-pay, first-serve.",
          "Feeding is once daily, as delegates are expected to be on a fast. If a medical condition prevents you fasting, say so in the comments and bring your own snacks.",
        ],
      },
    },
  ],

  "register.welcome": [
    { id: "d1", type: "heading", visible: true, props: { text: "Welcome", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "paragraph",
      visible: true,
      props: {
        text: `Welcome to the official registration and accommodation booking portal for the **${EVENT.shortName}** — a life-transforming spiritual encounter you don't want to miss.`,
        size: "base",
        align: "left",
        muted: false,
      },
    },
    {
      id: "d3",
      type: "factGrid",
      visible: true,
      props: {
        columns: 2,
        items: [
          { label: "Date", value: EVENT.dateLabel },
          { label: "Venue", value: EVENT.venue },
          { label: "Host", value: EVENT.host },
          { label: "Starts", value: EVENT.startTimeLabel },
        ],
      },
    },
    { id: "d4", type: "heading", visible: true, props: { text: "Arrival and departure", level: "h4", align: "left" } },
    {
      id: "d5",
      type: "paragraph",
      visible: true,
      props: {
        text: "Participants travelling from distant locations may arrive from Friday, 2nd October 2026. The retreat concludes on Sunday, 4th October 2026.",
        size: "sm",
        align: "left",
        muted: true,
      },
    },
    { id: "d6", type: "heading", visible: true, props: { text: "Who can register?", level: "h4", align: "left" } },
    {
      id: "d7",
      type: "paragraph",
      visible: true,
      props: {
        text: "Everyone is welcome — whether it is your first time or you have attended before. Come expecting divine encounters and lasting transformation.",
        size: "sm",
        align: "left",
        muted: true,
      },
    },
    {
      id: "d8",
      type: "notice",
      visible: true,
      props: {
        tone: "warning",
        text: "Fill each section carefully and submit only once. Once submitted, our team receives your details for processing.",
      },
    },
  ],

  "register.fees": [
    { id: "d1", type: "heading", visible: true, props: { text: "Fees", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "paragraph",
      visible: true,
      props: {
        text: "Every option below covers registration, feeding and accommodation for the full duration of the retreat.",
        size: "sm",
        align: "left",
        muted: true,
      },
    },
    { id: "d3", type: "pricingTable", visible: true, props: { showDescription: true, showSoldOut: true } },
    {
      id: "d4",
      type: "notice",
      visible: true,
      props: {
        tone: "info",
        text: "Installment payments are accepted, but the full amount must be paid before the retreat begins.",
      },
    },
  ],

  "register.feeding": [
    { id: "d1", type: "heading", visible: true, props: { text: "Feeding", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "notice",
      visible: true,
      props: {
        tone: "info",
        text: "Feeding is once daily, as delegates are expected to be on a fast. If a medical condition prevents you from fasting, please say so below and bring along your own snacks.",
      },
    },
  ],

  "register.payment": [
    { id: "d1", type: "heading", visible: true, props: { text: "Payment", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "paragraph",
      visible: true,
      props: {
        text: "Transfer the total below, then send your receipt. Your place is reserved once a sub-admin confirms the payment.",
        size: "sm",
        align: "left",
        muted: true,
      },
    },
  ],

  "register.submitted": [
    { id: "d1", type: "heading", visible: true, props: { text: "Registration received", level: "h2", align: "left" } },
    {
      id: "d2",
      type: "paragraph",
      visible: true,
      props: {
        text: "Thank you. We have your details. Once your payment is confirmed you will receive an email with your LFF ID and accommodation code.",
        size: "base",
        align: "left",
        muted: false,
      },
    },
  ],

  "status.intro": [],
}

export function defaultBlocksFor(slug: string): Block[] {
  return structuredClone(DEFAULT_CONTENT[slug] ?? [])
}

/** The shipped copy as a single unstyled section. */
export function defaultSectionsFor(slug: string): Section[] {
  return toSections({ blocks: defaultBlocksFor(slug) })
}

async function loadPublished(slug: string): Promise<Section[]> {
  await connectDB()

  const doc = await SiteContentModel.findOne({ slug }).lean()

  // A slot that has never been saved falls back to the shipped copy, so the
  // site is never blank just because nobody has opened the editor.
  if (!doc) return defaultSectionsFor(slug)

  return toSections({ sections: doc.sections, blocks: doc.blocks })
}

/**
 * Published content for a section, cached until something is published.
 * The public pages call this on every render, so it must not hit Mongo each
 * time — `revalidateTag` in the publish action is what refreshes it.
 */
export const getSection = (slug: string) =>
  unstable_cache(() => loadPublished(slug), ["site-content", slug], {
    revalidate: 300,
    tags: [CACHE_TAG],
  })()

/** Several slots at once, for a page that renders more than one. */
export async function getSections(slugs: string[]) {
  const entries = await Promise.all(slugs.map(async (slug) => [slug, await getSection(slug)] as const))
  return Object.fromEntries(entries) as Record<string, Section[]>
}

/** Editor view: the draft if one exists, otherwise what is published. */
export async function getEditableSection(slug: string) {
  await connectDB()

  const doc = await SiteContentModel.findOne({ slug }).lean()

  if (!doc) {
    return { sections: defaultSectionsFor(slug), hasDraft: false, publishedAt: null }
  }

  // A draft can be either shape: `draftSections` once the section editor has
  // saved it, `draftBlocks` if it was left over from the flat-list editor.
  const hasDraft = Array.isArray(doc.draftSections) || Array.isArray(doc.draftBlocks)

  const sections = hasDraft
    ? toSections({ sections: doc.draftSections, blocks: doc.draftBlocks })
    : toSections({ sections: doc.sections, blocks: doc.blocks })

  return {
    sections,
    hasDraft,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
  }
}

/**
 * Expire the content cache immediately.
 *
 * Next 16 split these: `revalidateTag` now takes a cache-life profile and
 * expires lazily, while `updateTag` gives read-your-own-writes inside a Server
 * Action. Publishing must be visible on the very next render, so this is
 * `updateTag` and may only be called from an action.
 */
export function invalidateSiteContent() {
  updateTag(CACHE_TAG)
}

// ── Custom pages ─────────────────────────────────────────────────────

export type PublicPage = {
  id: string
  slug: string
  title: string
  navLabel: string
  showInNav: boolean
  navOrder: number
  seoDescription: string
  sections: Section[]
}

async function loadPage(slug: string): Promise<PublicPage | null> {
  await connectDB()

  const doc = await SitePageModel.findOne({ slug, isPublished: true }).lean()
  if (!doc) return null

  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    navLabel: doc.navLabel || doc.title,
    showInNav: doc.showInNav,
    navOrder: doc.navOrder,
    seoDescription: doc.seoDescription,
    sections: toSections({ sections: doc.sections }),
  }
}

/** A published page by its address. Cached until a page is published. */
export const getPublishedPage = (slug: string) =>
  unstable_cache(() => loadPage(slug), ["site-page", slug], {
    revalidate: 300,
    tags: [PAGES_TAG],
  })()

async function loadNavPages() {
  await connectDB()

  const docs = await SitePageModel.find({ isPublished: true, showInNav: true })
    .select("slug title navLabel navOrder")
    .sort({ navOrder: 1, title: 1 })
    .lean()

  return docs.map((doc) => ({
    slug: doc.slug,
    label: doc.navLabel || doc.title,
  }))
}

/** Published pages that asked to appear in the site header. */
export const getNavPages = () =>
  unstable_cache(loadNavPages, ["site-nav"], { revalidate: 300, tags: [PAGES_TAG] })()

/** Editor view of one page: the draft if there is one, otherwise what is live. */
export async function getEditablePage(pageId: string) {
  await connectDB()

  const doc = await SitePageModel.findById(pageId).lean()
  if (!doc) return null

  const hasDraft = Array.isArray(doc.draftSections)

  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    navLabel: doc.navLabel,
    showInNav: doc.showInNav,
    navOrder: doc.navOrder,
    seoDescription: doc.seoDescription,
    isPublished: doc.isPublished,
    hasDraft,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    sections: toSections({ sections: hasDraft ? doc.draftSections : doc.sections }),
  }
}

/** Every page, for the dashboard list. */
export async function listPages() {
  await connectDB()

  const docs = await SitePageModel.find()
    .select("slug title isPublished showInNav navOrder publishedAt draftSections updatedAt")
    .sort({ navOrder: 1, title: 1 })
    .lean()

  return docs.map((doc) => ({
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    isPublished: doc.isPublished,
    showInNav: doc.showInNav,
    hasDraft: Array.isArray(doc.draftSections),
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  }))
}

export function invalidateSitePages() {
  updateTag(PAGES_TAG)
}
