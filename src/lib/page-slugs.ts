/**
 * Custom pages are served from the root — `/about`, not `/p/about` — so their
 * slugs have to stay out of the way of the app's own routes.
 *
 * Next matches a static segment before a dynamic one, so `/register` would win
 * regardless; the guard exists so a super admin gets told why their page is
 * unreachable at save time instead of wondering why it never appears.
 */
export const RESERVED_PAGE_SLUGS = new Set([
  "api",
  "auth",
  "dashboard",
  "pastor",
  "register",
  "status",
  "forms",
  "_next",
  "favicon.ico",
  "icon.png",
  "robots.txt",
  "sitemap.xml",
  "opengraph-image",
])

/** A title turned into a URL segment. Empty means "not usable as an address". */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
}
