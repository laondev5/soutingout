"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { z } from "zod"
import { SiteContentModel, SitePageModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { defaultSectionsFor, invalidateSiteContent, invalidateSitePages } from "@/lib/cms"
import { logActivity } from "@/lib/activity-log"
import { BLOCK_TYPES, isSectionSlug, newSection, type Section } from "@/lib/cms-blocks"
import { RESERVED_PAGE_SLUGS, slugify } from "@/lib/page-slugs"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Props and styles are widget-defined, so the shape is open — the size is not. */
const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  props: z.record(z.string(), z.unknown()).default({}),
  visible: z.boolean().default(true),
  style: z.record(z.string(), z.unknown()).optional(),
})

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120).default("Section"),
  visible: z.boolean().default(true),
  style: z.record(z.string(), z.unknown()).optional(),
  blocks: z.array(blockSchema).max(120, "That is too many widgets for one section."),
})

const sectionsSchema = z
  .array(sectionSchema)
  .max(40, "That is too many sections for one page.")

/** Guards against a runaway paste blowing up the document size limit. */
const MAX_SERIALISED_BYTES = 512 * 1024

function tooLarge(value: unknown) {
  return JSON.stringify(value).length > MAX_SERIALISED_BYTES
}

/** The paths that render each slot, so a publish refreshes the right pages. */
const AFFECTED_PATHS: Record<string, string[]> = {
  "home.hero": ["/"],
  "home.body": ["/"],
  "register.welcome": ["/register"],
  "register.fees": ["/register"],
  "register.feeding": ["/register"],
  "register.payment": ["/register"],
  "register.submitted": ["/register"],
  "status.intro": ["/status"],
}

// ── Built-in slots ───────────────────────────────────────────────────

/** Save without publishing. The live site keeps showing the previous version. */
export async function saveDraft(input: {
  slug: string
  sections: Section[]
}): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireSuperAdmin()

  if (!isSectionSlug(input.slug)) {
    return { ok: false, error: "Unknown page section." }
  }

  const parsed = sectionsSchema.safeParse(input.sections)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That content could not be saved." }
  }

  if (tooLarge(parsed.data)) {
    return { ok: false, error: "This page is too large. Split it up or shorten the text." }
  }

  await connectDB()

  await SiteContentModel.updateOne(
    { slug: input.slug },
    {
      $set: {
        draftSections: parsed.data,
        draftBlocks: null,
        updatedByUserId: new mongoose.Types.ObjectId(user.id),
      },
      // A slot edited before it was ever published needs the current defaults
      // as its published baseline, or the live page would go blank.
      $setOnInsert: { sections: defaultSectionsFor(input.slug) },
    },
    { upsert: true }
  )

  revalidatePath("/dashboard/cms")

  return { ok: true, savedAt: new Date().toISOString() }
}

/** Push the draft live. */
export async function publishSection(input: {
  slug: string
  sections: Section[]
}): Promise<ActionResult<{ publishedAt: string }>> {
  const user = await requireSuperAdmin()

  if (!isSectionSlug(input.slug)) {
    return { ok: false, error: "Unknown page section." }
  }

  const parsed = sectionsSchema.safeParse(input.sections)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That content could not be published.",
    }
  }

  if (tooLarge(parsed.data)) {
    return { ok: false, error: "This page is too large. Split it up or shorten the text." }
  }

  await connectDB()

  const publishedAt = new Date()

  await SiteContentModel.updateOne(
    { slug: input.slug },
    {
      $set: {
        sections: parsed.data,
        // The flat list is what the pre-sections editor wrote. Clearing it
        // stops `toSections` ever falling back to stale copy.
        blocks: [],
        draftSections: null,
        draftBlocks: null,
        publishedAt,
        updatedByUserId: new mongoose.Types.ObjectId(user.id),
      },
    },
    { upsert: true }
  )

  await logActivity({
    actorUserId: user.id,
    action: "cms.published",
    entityType: "site_content",
    entityId: input.slug,
    details: {
      sections: parsed.data.length,
      blocks: parsed.data.reduce((total, section) => total + section.blocks.length, 0),
    },
  })

  invalidateSiteContent()
  for (const path of AFFECTED_PATHS[input.slug] ?? []) {
    revalidatePath(path)
  }
  revalidatePath("/dashboard/cms")

  return { ok: true, publishedAt: publishedAt.toISOString() }
}

/** Throw the draft away and go back to what is live. */
export async function discardDraft(input: { slug: string }): Promise<ActionResult> {
  await requireSuperAdmin()

  if (!isSectionSlug(input.slug)) {
    return { ok: false, error: "Unknown page section." }
  }

  await connectDB()
  await SiteContentModel.updateOne(
    { slug: input.slug },
    { $set: { draftSections: null, draftBlocks: null } }
  )

  revalidatePath("/dashboard/cms")
  return { ok: true }
}

/** Restore the copy the app shipped with. */
export async function resetSection(
  input: { slug: string }
): Promise<ActionResult<{ sections: Section[] }>> {
  const user = await requireSuperAdmin()

  if (!isSectionSlug(input.slug)) {
    return { ok: false, error: "Unknown page section." }
  }

  const sections = defaultSectionsFor(input.slug)

  await connectDB()
  await SiteContentModel.updateOne(
    { slug: input.slug },
    {
      $set: {
        sections,
        blocks: [],
        draftSections: null,
        draftBlocks: null,
        publishedAt: new Date(),
        updatedByUserId: new mongoose.Types.ObjectId(user.id),
      },
    },
    { upsert: true }
  )

  await logActivity({
    actorUserId: user.id,
    action: "cms.reset",
    entityType: "site_content",
    entityId: input.slug,
  })

  invalidateSiteContent()
  for (const path of AFFECTED_PATHS[input.slug] ?? []) {
    revalidatePath(path)
  }
  revalidatePath("/dashboard/cms")

  return { ok: true, sections }
}

// ── Custom pages ─────────────────────────────────────────────────────

const pageMetaSchema = z.object({
  title: z.string().trim().min(1, "Give the page a title.").max(160),
  slug: z.string().trim().min(1, "Give the page a web address.").max(80),
  navLabel: z.string().trim().max(60).default(""),
  showInNav: z.boolean().default(false),
  navOrder: z.number().int().min(0).max(999).default(0),
  seoDescription: z.string().trim().max(300).default(""),
})

async function assertSlugFree(slug: string, exceptId?: string) {
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    return `"/${slug}" is used by the app itself. Choose another address.`
  }

  const filter: Record<string, unknown> = { slug }
  if (exceptId) filter._id = { $ne: new mongoose.Types.ObjectId(exceptId) }

  if (await SitePageModel.exists(filter)) {
    return `Another page already lives at "/${slug}".`
  }

  return null
}

export async function createPage(input: {
  title: string
  slug?: string
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireSuperAdmin()

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Give the page a title." }

  const slug = slugify(input.slug?.trim() || title)
  if (!slug) return { ok: false, error: "That title does not make a usable web address." }

  await connectDB()

  const clash = await assertSlugFree(slug)
  if (clash) return { ok: false, error: clash }

  const page = await SitePageModel.create({
    slug,
    title,
    navLabel: title,
    sections: [newSection("Section 1")],
    updatedByUserId: new mongoose.Types.ObjectId(user.id),
  })

  await logActivity({
    actorUserId: user.id,
    action: "page.created",
    entityType: "site_content",
    entityId: String(page._id),
    details: { slug, title },
  })

  invalidateSitePages()
  revalidatePath("/dashboard/cms")

  return { ok: true, id: String(page._id), slug }
}

export async function updatePageMeta(input: {
  pageId: string
  title: string
  slug: string
  navLabel: string
  showInNav: boolean
  navOrder: number
  seoDescription: string
}): Promise<ActionResult<{ slug: string }>> {
  const user = await requireSuperAdmin()

  const parsed = pageMetaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those settings are not valid." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const page = await SitePageModel.findById(input.pageId)
  if (!page) return { ok: false, error: "That page could not be found." }

  const slug = slugify(parsed.data.slug)
  if (!slug) return { ok: false, error: "That web address is not usable." }

  const clash = await assertSlugFree(slug, input.pageId)
  if (clash) return { ok: false, error: clash }

  const previousSlug = page.slug

  page.title = parsed.data.title
  page.slug = slug
  page.navLabel = parsed.data.navLabel || parsed.data.title
  page.showInNav = parsed.data.showInNav
  page.navOrder = parsed.data.navOrder
  page.seoDescription = parsed.data.seoDescription
  page.updatedByUserId = new mongoose.Types.ObjectId(user.id)
  await page.save()

  invalidateSitePages()
  revalidatePath("/dashboard/cms")
  revalidatePath(`/${previousSlug}`)
  revalidatePath(`/${slug}`)

  return { ok: true, slug }
}

export async function savePageDraft(input: {
  pageId: string
  sections: Section[]
}): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireSuperAdmin()

  const parsed = sectionsSchema.safeParse(input.sections)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That content could not be saved." }
  }

  if (tooLarge(parsed.data)) {
    return { ok: false, error: "This page is too large. Split it up or shorten the text." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const result = await SitePageModel.updateOne(
    { _id: input.pageId },
    {
      $set: {
        draftSections: parsed.data,
        updatedByUserId: new mongoose.Types.ObjectId(user.id),
      },
    }
  )

  if (result.matchedCount === 0) {
    return { ok: false, error: "That page could not be found." }
  }

  revalidatePath("/dashboard/cms")
  return { ok: true, savedAt: new Date().toISOString() }
}

export async function publishPage(input: {
  pageId: string
  sections: Section[]
}): Promise<ActionResult<{ publishedAt: string; slug: string }>> {
  const user = await requireSuperAdmin()

  const parsed = sectionsSchema.safeParse(input.sections)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That content could not be published.",
    }
  }

  if (tooLarge(parsed.data)) {
    return { ok: false, error: "This page is too large. Split it up or shorten the text." }
  }

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const page = await SitePageModel.findById(input.pageId)
  if (!page) return { ok: false, error: "That page could not be found." }

  const publishedAt = new Date()

  page.sections = parsed.data as never
  page.draftSections = null
  page.isPublished = true
  page.publishedAt = publishedAt
  page.updatedByUserId = new mongoose.Types.ObjectId(user.id)
  await page.save()

  await logActivity({
    actorUserId: user.id,
    action: "page.published",
    entityType: "site_content",
    entityId: String(page._id),
    details: { slug: page.slug, sections: parsed.data.length },
  })

  invalidateSitePages()
  revalidatePath(`/${page.slug}`)
  revalidatePath("/dashboard/cms")

  return { ok: true, publishedAt: publishedAt.toISOString(), slug: page.slug }
}

export async function setPagePublished(input: {
  pageId: string
  isPublished: boolean
}): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const page = await SitePageModel.findById(input.pageId)
  if (!page) return { ok: false, error: "That page could not be found." }

  page.isPublished = input.isPublished
  page.updatedByUserId = new mongoose.Types.ObjectId(user.id)
  await page.save()

  invalidateSitePages()
  revalidatePath(`/${page.slug}`)
  revalidatePath("/dashboard/cms")

  return { ok: true }
}

export async function deletePage(input: { pageId: string }): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const page = await SitePageModel.findById(input.pageId)
  if (!page) return { ok: false, error: "That page could not be found." }

  await SitePageModel.deleteOne({ _id: page._id })

  await logActivity({
    actorUserId: user.id,
    action: "page.deleted",
    entityType: "site_content",
    entityId: String(page._id),
    details: { slug: page.slug, title: page.title },
  })

  invalidateSitePages()
  revalidatePath(`/${page.slug}`)
  revalidatePath("/dashboard/cms")

  return { ok: true }
}

/** Copy a page, so a new one can start from something that already works. */
export async function duplicatePage(
  input: { pageId: string }
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireSuperAdmin()

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.pageId)) {
    return { ok: false, error: "That page could not be found." }
  }

  const page = await SitePageModel.findById(input.pageId).lean()
  if (!page) return { ok: false, error: "That page could not be found." }

  let slug = slugify(`${page.slug}-copy`)
  let suffix = 2

  while (await assertSlugFree(slug)) {
    slug = slugify(`${page.slug}-copy-${suffix}`)
    suffix += 1
    if (suffix > 50) return { ok: false, error: "Could not find a free web address." }
  }

  const copy = await SitePageModel.create({
    slug,
    title: `${page.title} (copy)`,
    navLabel: page.navLabel,
    showInNav: false,
    navOrder: page.navOrder,
    seoDescription: page.seoDescription,
    isPublished: false,
    sections: page.draftSections ?? page.sections,
    updatedByUserId: new mongoose.Types.ObjectId(user.id),
  })

  invalidateSitePages()
  revalidatePath("/dashboard/cms")

  return { ok: true, id: String(copy._id), slug }
}
