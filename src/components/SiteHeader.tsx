import Link from "next/link"
import { Logo } from "@/components/Logo"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type NavPage = { slug: string; label: string }

/**
 * The public header.
 *
 * Register and Check status stay in code: they are the two things a delegate
 * came to do, and losing them to a bad content edit would strand people. Pages
 * the super admin builds are added alongside them.
 */
export function SiteHeader({
  navPages = [],
  activeSlug,
}: {
  navPages?: NavPage[]
  activeSlug?: string
}) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Logo width={40} />
        </Link>

        {navPages.length > 0 ? (
          <nav aria-label="Pages" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            {navPages.map((page) => (
              <Link
                key={page.slug}
                href={`/${page.slug}`}
                aria-current={page.slug === activeSlug ? "page" : undefined}
                className={cn(
                  "text-sm transition-colors",
                  page.slug === activeSlug
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {page.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/status"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            My status
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            Register
          </Link>
        </div>
      </div>
    </header>
  )
}
