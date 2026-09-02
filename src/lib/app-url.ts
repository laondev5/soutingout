/**
 * The site's own base URL, used for Paystack callbacks and links in emails.
 *
 * Read only on the server, so it deliberately has no `NEXT_PUBLIC_` prefix —
 * that prefix inlines a value into the browser bundle, which this does not
 * need. The fallbacks mean a Vercel deploy works with no configuration at all,
 * and an existing `NEXT_PUBLIC_APP_URL` keeps working while it is renamed.
 */
export function appUrl() {
  const configured =
    process.env.APP_URL ??
    // Retained so renaming the variable in Vercel is not a breaking change.
    process.env.NEXT_PUBLIC_APP_URL ??
    // Vercel sets these automatically. The production one is the stable
    // domain; VERCEL_URL is the per-deployment hostname.
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    "http://localhost:3000"

  // A trailing slash would produce "//status" once a path is appended.
  return configured.replace(/\/+$/, "")
}
