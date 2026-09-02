import mongoose from "mongoose"
import { ACCOMMODATION_SEED } from "../src/lib/constants"
import { AccommodationModel } from "../src/lib/db-models"

/**
 * Idempotent: matches on codePrefix and updates in place, so re-running after
 * an admin has edited bed counts or prices will reset them to the seed values.
 * Only run this on a fresh database, or accept that overwrite.
 */
async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.")
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? "lff_sorting_out" })

  let created = 0
  let updated = 0

  for (const [index, seed] of ACCOMMODATION_SEED.entries()) {
    const existing = await AccommodationModel.findOne({ codePrefix: seed.codePrefix })

    const payload = {
      name: seed.name,
      codePrefix: seed.codePrefix,
      description: seed.description,
      formLabel: seed.label,
      pricePerPerson: seed.pricePerPerson,
      pricingMode: seed.pricingMode,
      capacityPerUnit: seed.capacityPerUnit,
      totalBeds: seed.totalBeds,
      isFree: false,
      isActive: true,
      sortOrder: index,
    }

    if (existing) {
      // Never clobber live inventory.
      await AccommodationModel.updateOne({ _id: existing._id }, { $set: payload })
      updated += 1
      console.log(`updated  ${seed.codePrefix.padEnd(5)} ${seed.name}`)
    } else {
      await AccommodationModel.create({ ...payload, bedsReserved: 0 })
      created += 1
      console.log(`created  ${seed.codePrefix.padEnd(5)} ${seed.name}`)
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`)
  await mongoose.disconnect()
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
