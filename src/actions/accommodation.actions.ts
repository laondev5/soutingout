"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { z } from "zod"
import { AccommodationModel, BookingModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, requireUser } from "@/lib/permissions"
import { deleteAsset, isCloudinaryConfigured } from "@/lib/cloudinary"
import { logActivity } from "@/lib/activity-log"
import { PRICING_MODES } from "@/lib/constants"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const imageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
})

const accommodationSchema = z
  .object({
    name: z.string().trim().min(2, "Give the accommodation a name."),
    codePrefix: z
      .string()
      .trim()
      .min(2, "The code prefix needs at least 2 letters.")
      .max(6, "Keep the code prefix to 6 characters or fewer.")
      .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only — it becomes part of the delegate code."),
    description: z.string().trim().max(600).default(""),
    isFree: z.boolean().default(false),
    pricePerPerson: z.number().int().min(0),
    pricingMode: z.enum(PRICING_MODES),
    capacityPerUnit: z.number().int().min(1).max(20),
    totalBeds: z.number().int().min(0),
    images: z.array(imageSchema).max(5).default([]),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .refine((value) => value.isFree || value.pricePerPerson > 0, {
    message: "Set a price, or mark the accommodation as free.",
    path: ["pricePerPerson"],
  })

export type AccommodationInput = z.input<typeof accommodationSchema>

async function requireManager() {
  const user = await requireUser()

  if (!can(user, "accommodations.manage")) {
    return { ok: false as const, error: "You do not have permission to manage accommodation." }
  }

  return { ok: true as const, user }
}

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form."
}

export async function createAccommodation(
  input: AccommodationInput
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireManager()
  if (!guard.ok) return guard

  const parsed = accommodationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) }
  }

  const values = parsed.data
  await connectDB()

  // The prefix is baked into every delegate code this tier issues, so a
  // duplicate would make two tiers indistinguishable from the code alone.
  const clash = await AccommodationModel.findOne({
    codePrefix: values.codePrefix.toUpperCase(),
  })

  if (clash) {
    return { ok: false, error: `The code prefix ${values.codePrefix.toUpperCase()} is already in use.` }
  }

  const created = await AccommodationModel.create({
    ...values,
    codePrefix: values.codePrefix.toUpperCase(),
    pricePerPerson: values.isFree ? 0 : values.pricePerPerson,
  })

  await logActivity({
    actorUserId: guard.user.id,
    action: "accommodation.created",
    entityType: "accommodation",
    entityId: String(created._id),
    details: { name: values.name, totalBeds: values.totalBeds, price: created.pricePerPerson },
  })

  revalidatePath("/dashboard/accommodations")
  revalidatePath("/register")

  return { ok: true, id: String(created._id) }
}

export async function updateAccommodation(
  input: AccommodationInput & { id: string }
): Promise<ActionResult> {
  const guard = await requireManager()
  if (!guard.ok) return guard

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  const parsed = accommodationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) }
  }

  const values = parsed.data
  await connectDB()

  const accommodation = await AccommodationModel.findById(input.id)
  if (!accommodation) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  const clash = await AccommodationModel.findOne({
    codePrefix: values.codePrefix.toUpperCase(),
    _id: { $ne: accommodation._id },
  })

  if (clash) {
    return { ok: false, error: `The code prefix ${values.codePrefix.toUpperCase()} is already in use.` }
  }

  // Beds already taken are a floor on capacity — dropping below them would
  // put the tier into a state it can never satisfy.
  if (values.totalBeds < accommodation.bedsReserved) {
    return {
      ok: false,
      error: `${accommodation.bedsReserved} beds are already confirmed here, so the total cannot go below that.`,
    }
  }

  const previousPrefix = accommodation.codePrefix

  accommodation.set({
    ...values,
    codePrefix: values.codePrefix.toUpperCase(),
    pricePerPerson: values.isFree ? 0 : values.pricePerPerson,
  })

  await accommodation.save()

  await logActivity({
    actorUserId: guard.user.id,
    action: "accommodation.updated",
    entityType: "accommodation",
    entityId: String(accommodation._id),
    details: {
      name: values.name,
      prefixChanged: previousPrefix !== values.codePrefix.toUpperCase(),
    },
  })

  revalidatePath("/dashboard/accommodations")
  revalidatePath("/register")

  return { ok: true }
}

/**
 * Deactivating takes a tier off the registration form without touching anyone
 * already booked into it — which is why there is no hard delete for a tier
 * that has bookings.
 */
export async function setAccommodationActive(input: {
  id: string
  isActive: boolean
}): Promise<ActionResult> {
  const guard = await requireManager()
  if (!guard.ok) return guard

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  await AccommodationModel.updateOne({ _id: input.id }, { $set: { isActive: input.isActive } })

  await logActivity({
    actorUserId: guard.user.id,
    action: input.isActive ? "accommodation.activated" : "accommodation.deactivated",
    entityType: "accommodation",
    entityId: input.id,
  })

  revalidatePath("/dashboard/accommodations")
  revalidatePath("/register")

  return { ok: true }
}

export async function deleteAccommodation(input: { id: string }): Promise<ActionResult> {
  const guard = await requireManager()
  if (!guard.ok) return guard

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  const bookings = await BookingModel.countDocuments({
    accommodationId: input.id,
    status: { $in: ["held", "confirmed"] },
  })

  if (bookings > 0) {
    return {
      ok: false,
      error: `${bookings} ${bookings === 1 ? "delegate is" : "delegates are"} booked here. Deactivate it instead of deleting.`,
    }
  }

  const accommodation = await AccommodationModel.findById(input.id)
  if (!accommodation) {
    return { ok: false, error: "That accommodation could not be found." }
  }

  // Take the photos out of Cloudinary too, so deleting does not leave orphans
  // in the media library.
  if (isCloudinaryConfigured()) {
    for (const image of accommodation.images ?? []) {
      try {
        await deleteAsset(image.publicId)
      } catch (error) {
        console.error("Failed to delete Cloudinary asset", { publicId: image.publicId, error })
      }
    }
  }

  await accommodation.deleteOne()

  await logActivity({
    actorUserId: guard.user.id,
    action: "accommodation.deleted",
    entityType: "accommodation",
    entityId: input.id,
    details: { name: accommodation.name },
  })

  revalidatePath("/dashboard/accommodations")
  revalidatePath("/register")

  return { ok: true }
}
