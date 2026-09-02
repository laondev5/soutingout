import mongoose from "mongoose"
import { AccommodationModel, BookingModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"

export type AccommodationOption = {
  id: string
  name: string
  description: string
  codePrefix: string
  pricePerPerson: number
  pricingMode: "per_person" | "flat"
  capacityPerUnit: number
  isFree: boolean
  totalBeds: number
  bedsTaken: number
  bedsAvailable: number
  images: { url: string }[]
}

/**
 * Beds "taken" counts confirmed reservations plus bookings still held by
 * unpaid registrations. Counting held bookings is what stops a popular tier
 * being promised to more people than it can hold while payments clear.
 */
export async function listAccommodationOptions(
  options: { includeInactive?: boolean } = {}
): Promise<AccommodationOption[]> {
  await connectDB()

  const filter = options.includeInactive ? {} : { isActive: true }
  const accommodations = await AccommodationModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean()

  const held = await BookingModel.aggregate<{ _id: mongoose.Types.ObjectId; beds: number }>([
    { $match: { status: "held" } },
    { $group: { _id: "$accommodationId", beds: { $sum: "$beds" } } },
  ])

  const heldByAccommodation = new Map(held.map((row) => [String(row._id), row.beds]))

  return accommodations.map((accommodation) => {
    const bedsTaken =
      (accommodation.bedsReserved ?? 0) + (heldByAccommodation.get(String(accommodation._id)) ?? 0)

    return {
      id: String(accommodation._id),
      name: accommodation.name,
      description: accommodation.description ?? "",
      codePrefix: accommodation.codePrefix,
      pricePerPerson: accommodation.pricePerPerson,
      pricingMode: (accommodation.pricingMode ?? "per_person") as "per_person" | "flat",
      capacityPerUnit: accommodation.capacityPerUnit ?? 1,
      isFree: accommodation.isFree ?? false,
      totalBeds: accommodation.totalBeds,
      bedsTaken,
      bedsAvailable: Math.max(0, accommodation.totalBeds - bedsTaken),
      images: (accommodation.images ?? []).map((image) => ({ url: image.url })),
    }
  })
}

export async function bedsAvailableFor(accommodationId: string | mongoose.Types.ObjectId) {
  await connectDB()

  const accommodation = await AccommodationModel.findById(accommodationId)
    .select("totalBeds bedsReserved")
    .lean()

  if (!accommodation) return 0

  const [held] = await BookingModel.aggregate<{ beds: number }>([
    {
      $match: {
        accommodationId: new mongoose.Types.ObjectId(String(accommodationId)),
        status: "held",
      },
    },
    { $group: { _id: null, beds: { $sum: "$beds" } } },
  ])

  return Math.max(
    0,
    accommodation.totalBeds - (accommodation.bedsReserved ?? 0) - (held?.beds ?? 0)
  )
}
