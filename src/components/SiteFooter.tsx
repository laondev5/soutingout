import Link from "next/link"
import { EVENT } from "@/lib/constants"

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
        <p>
          {EVENT.name} · {EVENT.venue}
        </p>
        <p className="flex items-center gap-4">
          <Link href="/register" className="hover:text-foreground">
            Register
          </Link>
          <Link href="/status" className="hover:text-foreground">
            Check status
          </Link>
          <a href={`tel:${EVENT.supportPhone.replace(/\s/g, "")}`} className="hover:text-foreground">
            {EVENT.supportPhone}
          </a>
        </p>
      </div>
    </footer>
  )
}
