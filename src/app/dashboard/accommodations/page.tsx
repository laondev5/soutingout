import { AccommodationModel, BookingModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { isCloudinaryConfigured } from "@/lib/cloudinary"
import {
  AccommodationManager,
  type AccommodationRow,
} from "@/components/dashboard/AccommodationManager"
import type { PricingMode } from "@/lib/constants"

// Bed counts move as people register, so this page is never cached.
export const dynamic = "force-dynamic"

export default async function AccommodationsPage() {
  await requireSuperAdmin()
  await connectDB()

  const [accommodations, held] = await Promise.all([
    AccommodationModel.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
    BookingModel.aggregate<{ _id: unknown; beds: number }>([
      { $match: { status: "held" } },
      { $group: { _id: "$accommodationId", beds: { $sum: "$beds" } } },
    ]),
  ])

  const heldByAccommodation = new Map(held.map((row) => [String(row._id), row.beds]))

  const rows: AccommodationRow[] = accommodations.map((row) => {
    const bedsTaken = (row.bedsReserved ?? 0) + (heldByAccommodation.get(String(row._id)) ?? 0)

    return {
      id: String(row._id),
      name: row.name,
      codePrefix: row.codePrefix,
      description: row.description ?? "",
      pricePerPerson: row.pricePerPerson,
      pricingMode: (row.pricingMode ?? "per_person") as PricingMode,
      isFree: row.isFree ?? false,
      capacityPerUnit: row.capacityPerUnit ?? 1,
      totalBeds: row.totalBeds,
      bedsTaken,
      bedsAvailable: Math.max(0, row.totalBeds - bedsTaken),
      isActive: row.isActive ?? true,
      sortOrder: row.sortOrder ?? 0,
      images: (row.images ?? []).map((image) => ({
        url: image.url,
        publicId: image.publicId,
      })),
    }
  })

  return <AccommodationManager accommodations={rows} uploadsEnabled={isCloudinaryConfigured()} />
}
