import Link from "next/link"
import {
  BedDouble,
  BookOpen,
  Check,
  Clock,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Utensils,
  Wifi,
} from "lucide-react"
import { Countdown } from "@/components/cms/Countdown"
import { buttonVariants } from "@/components/ui/button"
import { EVENT, formatNaira, whatsappLink } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { elementCss, normalizeElementStyle, safeStyleId, toneClass } from "@/lib/cms-style"
import type { Block } from "@/lib/cms-blocks"

export type PricingRow = {
  id: string
  name: string
  description: string
  pricePerPerson: number
  pricingMode: "per_person" | "flat"
  isFree: boolean
  bedsAvailable: number
}

export type RenderContext = {
  /** Rendered on a dark ground, so text colours flip. */
  onDark?: boolean
  /** Supplies the pricingTable widget; omit and that widget renders nothing. */
  pricing?: PricingRow[]
}

const ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

const JUSTIFY_CLASS: Record<string, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
}

export function BlockRenderer({
  blocks,
  context = {},
  className,
  animate = true,
}: {
  blocks: Block[]
  context?: RenderContext
  className?: string
  /** The editor shows animated widgets in their finished state. */
  animate?: boolean
}) {
  const visible = blocks.filter((block) => block.visible !== false)

  if (visible.length === 0) return null

  // One <style> for the whole list rather than an inline style per element,
  // because the per-device rules are container queries and those cannot be
  // expressed in a style attribute.
  const css = visible
    .map((block) => elementCss(`.cms-b-${safeStyleId(block.id)}`, normalizeElementStyle(block.style)))
    .join("")

  // `contents` keeps this wrapper out of the section's flex or grid, so the
  // widgets themselves are what get laid out. The gap comes from the section.
  return (
    <div className={cn("contents", className)}>
      <style>{css}</style>
      {visible.map((block) => {
        const style = normalizeElementStyle(block.style)

        return (
          <div
            key={block.id}
            className={cn(`cms-b-${safeStyleId(block.id)}`, toneClass(style.textTone))}
            data-appear={animate && style.appear.animation !== "none" ? "out" : undefined}
          >
            <BlockView block={block} context={context} />
          </div>
        )
      })}
    </div>
  )
}

function BlockView({ block, context }: { block: Block; context: RenderContext }) {
  const p = block.props ?? {}
  const str = (key: string, fallback = "") => (typeof p[key] === "string" ? (p[key] as string) : fallback)
  const bool = (key: string, fallback = false) =>
    typeof p[key] === "boolean" ? (p[key] as boolean) : fallback
  const num = (key: string, fallback: number) =>
    typeof p[key] === "number" ? (p[key] as number) : fallback

  switch (block.type) {
    case "heading": {
      const level = str("level", "h2")
      const align = ALIGN_CLASS[str("align", "left")] ?? "text-left"
      const sizes: Record<string, string> = {
        h1: "text-3xl sm:text-4xl font-semibold tracking-tight",
        h2: "text-2xl font-semibold tracking-tight",
        h3: "text-lg font-semibold",
        h4: "text-sm font-semibold",
      }
      const Tag = (["h1", "h2", "h3", "h4"].includes(level) ? level : "h2") as "h1"

      return <Tag className={cn(sizes[level] ?? sizes.h2, align)}>{str("text")}</Tag>
    }

    case "paragraph": {
      const sizes: Record<string, string> = { sm: "text-sm", base: "text-base", lg: "text-lg" }
      return (
        <p
          className={cn(
            sizes[str("size", "base")] ?? "text-base",
            ALIGN_CLASS[str("align", "left")] ?? "text-left",
            "leading-relaxed",
            bool("muted") && (context.onDark ? "opacity-80" : "text-muted-foreground")
          )}
        >
          <Inline text={str("text")} />
        </p>
      )
    }

    case "list": {
      const items = Array.isArray(p.items) ? (p.items as string[]) : []
      const Tag = bool("ordered") ? "ol" : "ul"

      return (
        <Tag
          className={cn(
            "space-y-1.5 text-sm leading-relaxed",
            bool("ordered") ? "list-decimal" : "list-disc",
            "pl-5",
            context.onDark ? "opacity-90" : "text-muted-foreground"
          )}
        >
          {items.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      )
    }

    case "notice": {
      const tones: Record<string, string> = {
        info: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
        warning:
          "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
        danger:
          "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100",
        neutral: "border-border bg-muted/50 text-foreground",
      }

      return (
        <div className={cn("rounded-lg border p-4 text-sm leading-relaxed", tones[str("tone", "info")] ?? tones.info)}>
          <Inline text={str("text")} />
        </div>
      )
    }

    case "image": {
      const url = str("url")
      if (!url) return null

      return (
        <figure className="space-y-2">
          {/* Cloudinary URLs are remote and arbitrary, so a plain img avoids
              having to allow-list hosts in next.config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={str("alt")}
            className={cn("w-full object-cover", bool("rounded", true) && "rounded-xl")}
          />
          {str("caption") ? (
            <figcaption className="text-xs text-muted-foreground">{str("caption")}</figcaption>
          ) : null}
        </figure>
      )
    }

    case "button": {
      const href = str("href", "/register")
      const external = /^https?:\/\//.test(href)
      const classes = buttonVariants({
        variant: (str("variant", "default") as "default" | "outline" | "ghost") ?? "default",
      })

      return (
        <div className={cn("flex", JUSTIFY_CLASS[str("align", "left")] ?? "justify-start")}>
          {external ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
              {str("label", "Click here")}
            </a>
          ) : (
            <Link href={href} className={classes}>
              {str("label", "Click here")}
            </Link>
          )}
        </div>
      )
    }

    case "factGrid": {
      const items = pairs(p.items)
      const columns = Math.min(4, Math.max(1, num("columns", 3)))
      const cols: Record<number, string> = {
        1: "sm:grid-cols-1",
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-3",
        4: "sm:grid-cols-2 lg:grid-cols-4",
      }

      return (
        <dl className={cn("grid grid-cols-1 gap-3", cols[columns])}>
          {items.map((item, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-4",
                context.onDark ? "border-emerald-900 bg-emerald-950/60" : "bg-card"
              )}
            >
              <dt
                className={cn(
                  "text-xs uppercase tracking-wider",
                  context.onDark ? "text-emerald-200/70" : "text-muted-foreground"
                )}
              >
                {item.label}
              </dt>
              <dd className="mt-2 text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )
    }

    case "pricingTable": {
      const rows = (context.pricing ?? []).filter(
        (row) => bool("showSoldOut", true) || row.bedsAvailable > 0
      )
      if (rows.length === 0) return null

      return (
        <ul className="divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.name}</p>
                {bool("showDescription", true) && row.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
                {row.bedsAvailable === 0 ? (
                  <p className="mt-1 text-xs font-medium text-destructive">Fully booked</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {row.isFree ? "Free" : formatNaira(row.pricePerPerson)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.pricingMode === "flat" ? "per unit" : "per person"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )
    }

    case "video": {
      const embed = embedUrl(str("url"))
      if (!embed) return null

      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl border">
          <iframe
            src={embed}
            title={str("title", "Video")}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )
    }

    case "faq": {
      const items = pairs(p.items)
      return (
        <div className="divide-y rounded-xl border">
          {items.map((item, i) => (
            <details key={i} className="group p-4">
              <summary className="cursor-pointer text-sm font-medium marker:content-['']">
                {item.label}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <Inline text={item.value} />
              </p>
            </details>
          ))}
        </div>
      )
    }

    case "divider":
      return <hr className="border-border" />

    case "spacer":
      return <div style={{ height: Math.min(200, Math.max(4, num("height", 24))) }} />

    case "cta": {
      const align = str("align", "center")
      return (
        <div className={cn("rounded-xl border p-6", ALIGN_CLASS[align] ?? "text-center")}>
          <h3 className="text-xl font-semibold tracking-tight">{str("heading")}</h3>
          {str("text") ? (
            <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              <Inline text={str("text")} />
            </p>
          ) : null}
          {str("label") && safeHref(str("href")) ? (
            <div className={cn("mt-5 flex", JUSTIFY_CLASS[align] ?? "justify-center")}>
              <Link
                href={safeHref(str("href"))!}
                className={buttonVariants({
                  variant: str("variant", "default") as "default",
                  size: "lg",
                })}
              >
                {str("label")}
              </Link>
            </div>
          ) : null}
        </div>
      )
    }

    case "imageText": {
      const url = str("url")
      const onRight = str("imageSide", "left") === "right"

      return (
        <div
          className={cn(
            "flex flex-col gap-6 sm:flex-row sm:items-center",
            onRight && "sm:flex-row-reverse"
          )}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={str("alt")}
              className={cn(
                "w-full object-cover sm:w-1/2",
                bool("rounded", true) && "rounded-xl"
              )}
            />
          ) : null}
          <div className={cn("min-w-0", url && "sm:w-1/2")}>
            {str("heading") ? (
              <h3 className="text-lg font-semibold tracking-tight">{str("heading")}</h3>
            ) : null}
            {str("text") ? (
              <p className="mt-2 text-sm leading-relaxed">
                <Inline text={str("text")} />
              </p>
            ) : null}
          </div>
        </div>
      )
    }

    case "card": {
      const url = str("url")
      const href = safeHref(str("href"))

      return (
        <div className="overflow-hidden rounded-xl border">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={str("alt")} className="h-44 w-full object-cover" />
          ) : null}
          <div className="p-4">
            <h3 className="text-base font-semibold">{str("heading")}</h3>
            {str("text") ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                <Inline text={str("text")} />
              </p>
            ) : null}
            {str("label") && href ? (
              <Link
                href={href}
                className="mt-3 inline-block text-sm font-medium underline underline-offset-2"
              >
                {str("label")}
              </Link>
            ) : null}
          </div>
        </div>
      )
    }

    case "stat": {
      const align = str("align", "center")
      return (
        <div className={ALIGN_CLASS[align] ?? "text-center"}>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{str("value")}</p>
          <p className="mt-1 text-sm font-medium">{str("label")}</p>
          {str("caption") ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{str("caption")}</p>
          ) : null}
        </div>
      )
    }

    case "quote": {
      const url = str("url")
      return (
        <figure className="rounded-xl border p-6">
          <blockquote className="text-base leading-relaxed">
            &ldquo;{str("text")}&rdquo;
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            {url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt="" className="size-9 rounded-full object-cover" />
            ) : null}
            <span className="text-sm">
              <span className="block font-medium">{str("author")}</span>
              {str("role") ? (
                <span className="block text-xs text-muted-foreground">{str("role")}</span>
              ) : null}
            </span>
          </figcaption>
        </figure>
      )
    }

    case "feature": {
      const Icon = FEATURE_ICONS[str("icon", "Star")] ?? Star
      return (
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{str("heading")}</h3>
            {str("text") ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <Inline text={str("text")} />
              </p>
            ) : null}
          </div>
        </div>
      )
    }

    case "gallery": {
      const images = imageList(p.images)
      if (images.length === 0) return null

      const columns = Math.min(5, Math.max(1, num("columns", 3)))

      return (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {images.map((image, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={image.url}
              alt={image.alt}
              className={cn(
                "aspect-4/3 w-full object-cover",
                bool("rounded", true) && "rounded-lg"
              )}
            />
          ))}
        </div>
      )
    }

    case "countdown":
      return (
        <Countdown
          target={str("target", EVENT.startsOn)}
          heading={str("heading")}
          align={str("align", "center")}
        />
      )

    case "bankDetails":
      return (
        <div className="rounded-xl border p-5">
          {str("heading") ? (
            <h3 className="text-base font-semibold">{str("heading")}</h3>
          ) : null}
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Account name</dt>
              <dd className="text-right font-medium">{EVENT.bank.accountName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Account number</dt>
              <dd className="text-right font-mono font-medium tabular-nums">
                {EVENT.bank.accountNumber}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="text-right font-medium">{EVENT.bank.bankName}</dd>
            </div>
          </dl>
          {str("note") ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              <Inline text={str("note")} />
            </p>
          ) : null}
        </div>
      )

    case "steps": {
      const items = pairs(p.items)
      return (
        <ol className="space-y-4">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium">{item.label}</p>
                {item.value ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    <Inline text={item.value} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )
    }

    case "table": {
      const items = pairs(p.items)
      if (items.length === 0) return null

      return (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            {str("caption") ? (
              <caption className="px-4 pt-3 text-left text-xs text-muted-foreground">
                {str("caption")}
              </caption>
            ) : null}
            <tbody className="divide-y">
              {items.map((item, i) => (
                <tr key={i}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {item.label}
                  </th>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case "contact": {
      const align = str("align", "left")
      const phone = str("phone").replace(/[^\d+]/g, "")
      const email = str("email").trim()

      return (
        <div>
          {str("heading") ? (
            <h3 className={cn("text-base font-semibold", ALIGN_CLASS[align])}>{str("heading")}</h3>
          ) : null}
          <div className={cn("mt-3 flex flex-wrap gap-2", JUSTIFY_CLASS[align] ?? "justify-start")}>
            {phone ? (
              <a href={`tel:${phone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Phone className="size-4" /> Call
              </a>
            ) : null}
            {bool("whatsapp", true) ? (
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            ) : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Mail className="size-4" /> Email
              </a>
            ) : null}
          </div>
        </div>
      )
    }

    case "map": {
      const query = str("query", EVENT.venue).trim()
      if (!query) return null

      const height = Math.min(800, Math.max(160, num("height", 320)))

      return (
        <figure>
          <div className="overflow-hidden rounded-xl border" style={{ height }}>
            <iframe
              // The `output=embed` form needs no API key and takes only a
              // search term, so nothing user-written reaches a script context.
              src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
              title={`Map of ${query}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="size-full border-0"
            />
          </div>
          {str("caption") ? (
            <figcaption className="mt-2 text-xs text-muted-foreground">{str("caption")}</figcaption>
          ) : null}
        </figure>
      )
    }

    default:
      return null
  }
}

/** The icon set the Feature widget offers, keyed by the name stored in props. */
const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Star,
  Heart,
  Check,
  Sparkles,
  BookOpen,
  Users,
  MapPin,
  Clock,
  BedDouble,
  Utensils,
  Wifi,
  ShieldCheck,
}

/** Only site-relative and http(s) links survive; anything else is dropped. */
function safeHref(value: string): string | null {
  const href = value.trim()
  if (!href) return null
  return /^(https?:\/\/|\/)/.test(href) ? href : null
}

function imageList(value: unknown): { url: string; alt: string }[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return { url: item, alt: "" }
      const entry = (item ?? {}) as { url?: unknown; alt?: unknown }
      return { url: String(entry.url ?? ""), alt: String(entry.alt ?? "") }
    })
    .filter((image) => image.url.length > 0)
}

function pairs(value: unknown): { label: string; value: string }[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { label: string; value: string } => Boolean(item) && typeof item === "object")
    .map((item) => ({ label: String(item.label ?? ""), value: String(item.value ?? "") }))
}

/**
 * A deliberately tiny subset of Markdown — bold, italic and links — rendered
 * as React elements rather than `dangerouslySetInnerHTML`. Editors get light
 * formatting without the CMS becoming an HTML injection point.
 */
function Inline({ text }: { text: string }) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern).filter(Boolean)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }

        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>
        }

        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          const href = link[2]
          // Only http(s) and site-relative links; anything else (javascript:,
          // data:) is rendered as plain text.
          if (!/^(https?:\/\/|\/)/.test(href)) return <span key={i}>{link[1]}</span>

          return (
            <a
              key={i}
              href={href}
              className="underline underline-offset-2"
              {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {link[1]}
            </a>
          )
        }

        return <span key={i}>{part}</span>
      })}
    </>
  )
}

/** Accept a normal YouTube/Vimeo link and turn it into its embed form. */
function embedUrl(raw: string): string | null {
  if (!raw) return null

  const youtube = raw.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  )
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`

  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return null
}
