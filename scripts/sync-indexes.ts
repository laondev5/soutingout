/**
 * Push the schema's indexes to the live database. `syncIndexes` also drops
 * indexes that are no longer declared, so this is the one place index changes
 * take effect — Mongoose only auto-builds them in development.
 */
import { connectDB } from "@/lib/mongoose"
import {
  AccommodationModel,
  ActivityLogModel,
  AssignmentModel,
  BookingModel,
  DelegateModel,
  FormFieldModel,
  ImportBatchModel,
  PastoralSessionModel,
  PaymentModel,
  SiteContentModel,
  UserModel,
} from "@/lib/db-models"

const MODELS = [
  UserModel,
  AccommodationModel,
  DelegateModel,
  BookingModel,
  PaymentModel,
  PastoralSessionModel,
  AssignmentModel,
  ImportBatchModel,
  ActivityLogModel,
  SiteContentModel,
  FormFieldModel,
]

async function main() {
  await connectDB()

  for (const model of MODELS) {
    const dropped = await model.syncIndexes()
    const indexes = await model.listIndexes()
    console.log(
      `${model.modelName.padEnd(16)} ${indexes.length} indexes` +
        (dropped.length ? ` (dropped ${dropped.join(", ")})` : "")
    )
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
