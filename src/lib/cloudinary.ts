import "server-only"
import { v2 as cloudinary } from "cloudinary"

let configured = false

function configure() {
  if (configured) return

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be configured."
    )
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
  configured = true
}

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  )
}

export const FOLDERS = {
  receipts: "lff-sorting-out/receipts",
  accommodations: "lff-sorting-out/accommodations",
} as const

/**
 * Sign an upload so the browser can send the file straight to Cloudinary. The
 * API secret is used here and never leaves the server; the client only ever
 * sees the signature, timestamp and public API key.
 */
export function signUpload(input: { folder: string; publicId?: string }) {
  configure()

  const timestamp = Math.round(Date.now() / 1000)
  const params: Record<string, string | number> = {
    timestamp,
    folder: input.folder,
  }

  if (input.publicId) {
    params.public_id = input.publicId
  }

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET as string
  )

  return {
    signature,
    timestamp,
    folder: input.folder,
    publicId: input.publicId,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
  }
}

export async function deleteAsset(publicId: string) {
  configure()
  return cloudinary.uploader.destroy(publicId)
}
