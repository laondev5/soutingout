import Image from "next/image"
import { cn } from "@/lib/utils"
import { EVENT } from "@/lib/constants"

/**
 * The Living Faith Foundation mark. The source art is transparent with dark
 * green and red ink, so it needs a light plate to stay legible on dark
 * backgrounds — `onDark` supplies one.
 */
export function Logo({
  className,
  width = 40,
  onDark = false,
  priority = false,
}: {
  className?: string
  width?: number
  onDark?: boolean
  priority?: boolean
}) {
  return (
    <Image
      src="/logo.png"
      alt={`${EVENT.shortName} — Living Faith Foundation`}
      width={width}
      height={Math.round((width * 764) / 1009)}
      priority={priority}
      className={cn(
        "h-auto w-auto object-contain",
        onDark && "rounded-md bg-white/95 p-1",
        className
      )}
      style={{ width, height: "auto" }}
    />
  )
}

/** Logo plus the event name, for headers and the sidebar. */
export function LogoLockup({
  onDark = false,
  subtitle,
  width = 36,
}: {
  onDark?: boolean
  subtitle?: string
  width?: number
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo width={width} onDark={onDark} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight tracking-tight">
          {EVENT.shortName}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-xs",
              onDark ? "text-slate-400" : "text-muted-foreground"
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  )
}
