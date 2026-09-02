import mongoose from "mongoose"
import bcryptjs from "bcryptjs"
import { UserModel } from "../src/lib/db-models"
import { PERMISSIONS } from "../src/lib/constants"

/**
 * Creates the first super admin. Reads credentials from the environment so a
 * password never lands in shell history or the repo.
 *
 *   SEED_SUPER_ADMIN_NAME / _EMAIL / _PASSWORD
 */
async function run() {
  const uri = process.env.MONGODB_URI
  const name = process.env.SEED_SUPER_ADMIN_NAME
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD

  if (!uri) throw new Error("MONGODB_URI is not configured.")
  if (!name || !email || !password) {
    throw new Error(
      "Set SEED_SUPER_ADMIN_NAME, SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD in .env.local"
    )
  }
  if (password.length < 10) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD must be at least 10 characters.")
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? "lff_sorting_out" })

  const existing = await UserModel.findOne({ email })
  const passwordHash = await bcryptjs.hash(password, 12)

  if (existing) {
    existing.name = name
    existing.passwordHash = passwordHash
    existing.role = "super_admin"
    existing.permissions = [...PERMISSIONS]
    existing.isActive = true
    await existing.save()
    console.log(`Updated existing super admin: ${email}`)
  } else {
    await UserModel.create({
      name,
      email,
      passwordHash,
      role: "super_admin",
      permissions: [...PERMISSIONS],
      isActive: true,
    })
    console.log(`Created super admin: ${email}`)
  }

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
