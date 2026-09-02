"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { z } from "zod"
import { SiteContentModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { defaultBlocksFor, invalidateSiteContent } from "@/lib/cms"
import { logActivity } from "@/lib/activity-log"
import { BLOCK_TYPES, isSectionSlug, type Block } from "@/lib/cms-blocks"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Props are widget-defined, so the shape is open — but the size is not. */
const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  props: z.record(z.string(), z.unknown()).default({}),
  visible: z.boolean().default(true),
})

const payloadSchema = z.object({
  slug: z.string().refine(isSectionSlug, {
    message: "Unknown page section.",
  }),
  blocks: z.array(blockSchema).max(80, "That is too many blocks for one section."),
})

/** Guards against a runaway paste blowing up the document size limit. */
const MAX_SERIALISED_BYTES = 256 * 1024

function tooLarge(blocks: unknown) {
  return JSON.stringify(blocks).length > MAX_SERIALISED_BYTES
}

/** The paths that render each section, so a publish refreshes the right pages. */
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

/** Save without publishing. The live site keeps showing the previous version. */
export async function saveDraft(input: {
  slug: string
  blocks: Block[]
}): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireSuperAdmin()

  const parsed = payloadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That content could not be saved." }
  }

  if (tooLarge(parsed.data.blocks)) {
    return { ok: false, error: "This section is too large. Split it up or shorten the text." }
  }

  await connectDB()

  await SiteContentModel.updateOne(
    { slug: parsed.data.slug },
    {
      $set: {
        draftBlocks: parsed.data.blocks,
        updatedByUserId: new mongoose.Types.ObjectId(user.id),
      },
      // A section edited before it was ever published needs the current
      // defaults as its published baseline, or the live page would go blank.
      $setOnInsert: { blocks: defaultBlocksFor(parsed.data.slug) },
    },
    { upsert: true }
  )

  revalidatePath("/dashboard/cms")

  return { ok: true, savedAt: new Date().toISOString() }
}

/** Push the draft live. */
export async function publishSection(input: {
  slug: string
  blocks: Block[]
}): Promise<ActionResult<{ publishedAt: string }>> {
  const user = await requireSuperAdmin()

  const parsed = payloadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That content could not be published." }
  }

  if (tooLarge(parsed.data.blocks)) {
    return { ok: false, error: "This section is too large. Split it up or shorten the text." }
  }

  await connectDB()

  const publishedAt = new Date()

  await SiteContentModel.updateOne(
    { slug: parsed.data.slug },
    {
      $set: {
        blocks: parsed.data.blocks,
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
    entityId: parsed.data.slug,
    details: { blocks: parsed.data.blocks.length },
  })

  invalidateSiteContent()
  for (const path of AFFECTED_PATHS[parsed.data.slug] ?? []) {
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
  await SiteContentModel.updateOne({ slug: input.slug }, { $set: { draftBlocks: null } })

  revalidatePath("/dashboard/cms")
  return { ok: true }
}

/** Restore the copy the app shipped with. */
export async function resetSection(
  input: { slug: string }
): Promise<ActionResult<{ blocks: Block[] }>> {
  const user = await requireSuperAdmin()

  if (!isSectionSlug(input.slug)) {
    return { ok: false, error: "Unknown page section." }
  }

  const blocks = defaultBlocksFor(input.slug)

  await connectDB()
  await SiteContentModel.updateOne(
    { slug: input.slug },
    {
      $set: {
        blocks,
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

  return { ok: true, blocks }
}
