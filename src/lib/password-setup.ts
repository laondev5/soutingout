import crypto from "node:crypto"

/**
 * How long a set-password link stays usable.
 *
 * Long enough that someone invited on a Friday can still act on Monday, short
 * enough that an old email forwarded around later is worthless.
 */
export const PASSWORD_SETUP_TTL_HOURS = 72

/** The shortest password a staff account may be given. */
export const MIN_PASSWORD_LENGTH = 10

/**
 * SHA-256, deliberately — not bcrypt.
 *
 * A slow hash exists to make a *guessable* secret expensive to attack. This
 * token is 32 random bytes, so there is nothing to guess; all the hash has to
 * do is make sure the stored value cannot be replayed as a link.
 */
export function hashPasswordSetupToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/**
 * Mint a set-password link.
 *
 * Only `tokenHash` is ever written to the database. The raw token goes into
 * the email and nowhere else, so a leaked database cannot be turned back into
 * account access.
 */
export function generatePasswordSetupToken() {
  const token = crypto.randomBytes(32).toString("base64url")

  return {
    token,
    tokenHash: hashPasswordSetupToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_SETUP_TTL_HOURS * 60 * 60 * 1000),
  }
}

/** Where a minted token is redeemed. */
export function passwordSetupPath(token: string) {
  return `/auth/set-password/${token}`
}
