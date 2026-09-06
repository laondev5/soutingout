import crypto from "node:crypto"

/**
 * A private key into one delegate's status page (`/status/<token>`).
 *
 * 24 random bytes, base64url-encoded — 32 characters, URL-safe, and
 * effectively unguessable. Generated once at delegate creation and never
 * rotated, so an emailed link keeps working for as long as the delegate wants
 * to revisit their profile.
 */
export function generateStatusToken() {
  return crypto.randomBytes(24).toString("base64url")
}
