/**
 * The style layer for the page builder.
 *
 * One `ElementStyle` covers both sections and widgets — a section is just an
 * element that holds other elements, which is how Framer treats a frame, and
 * it means the CSS generator and the inspector are written once.
 *
 * Client-safe: the editor, the property panels and the public renderer all
 * read from this one definition.
 *
 * Responsiveness is done with **container queries**, not media queries. The
 * editor previews a phone by narrowing a wrapper to 390px, and a container
 * query reacts to that wrapper's width, so what the editor shows is what the
 * page does. Media queries would only ever see the real browser window and the
 * preview would lie.
 */

export const DEVICES = ["desktop", "tablet", "mobile"] as const
export type Device = (typeof DEVICES)[number]

export const DEVICE_LABELS: Record<Device, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
}

/** Preview widths, chosen to sit inside the breakpoints below. */
export const DEVICE_WIDTHS: Record<Device, number> = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
}

/** Container breakpoints. Desktop is the base; the others narrow from it. */
export const DEVICE_BREAKPOINTS: Record<Exclude<Device, "desktop">, number> = {
  tablet: 1023,
  mobile: 639,
}

export type Sides = { top: number; right: number; bottom: number; left: number }

/**
 * A value with optional per-device overrides. `desktop` is the base and is
 * always present; a null override means "inherit the wider size", which is how
 * a designer expects it to behave.
 */
export type Responsive<T> = { desktop: T; tablet: T | null; mobile: T | null }

export type BackgroundKind = "none" | "color" | "image" | "gradient"

export type Background = {
  kind: BackgroundKind
  color: string
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  imageUrl: string
  imagePublicId: string
  imagePosition: string
  imageSize: "cover" | "contain" | "auto"
  /** Keeps the image still while the page scrolls. */
  imageFixed: boolean
  /** 0–100. A dark wash so text stays readable over a busy photo. */
  overlay: number
}

export type LayoutStyle = {
  direction: "column" | "row"
  gap: Responsive<number>
  justify: "start" | "center" | "end" | "between" | "around"
  alignItems: "stretch" | "start" | "center" | "end"
  wrap: boolean
  /** 0 uses flex; 1 or more switches to a grid with that many columns. */
  columns: Responsive<number>
}

export type BorderStyle = {
  width: number
  style: "none" | "solid" | "dashed" | "dotted"
  color: string
  radius: number
}

export const SHADOW_PRESETS = ["none", "sm", "md", "lg", "xl", "inner"] as const
export type ShadowPreset = (typeof SHADOW_PRESETS)[number]

export const FONT_FAMILIES = ["inherit", "sans", "serif", "mono"] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]

export type Typography = {
  family: FontFamily
  /** 0 means inherit. */
  size: Responsive<number>
  weight: number
  /** Stored ×100, so 150 is a line-height of 1.5. 0 means inherit. */
  lineHeight: number
  letterSpacing: number
  transform: "none" | "uppercase" | "lowercase" | "capitalize"
  /** Empty means inherit. */
  color: string
  align: "inherit" | "left" | "center" | "right" | "justify"
}

export type Effects = {
  /** 0–100. */
  opacity: number
  blur: number
  rotate: number
  /** Stored ×100, so 105 is scale(1.05). */
  scale: number
}

export type HoverStyle = {
  enabled: boolean
  opacity: number | null
  scale: number | null
  shadow: ShadowPreset | null
  color: string
  background: string
  /** Milliseconds. */
  transition: number
}

export const APPEAR_ANIMATIONS = [
  "none",
  "fade",
  "fadeUp",
  "fadeDown",
  "fadeLeft",
  "fadeRight",
  "zoom",
] as const
export type AppearAnimation = (typeof APPEAR_ANIMATIONS)[number]

export const APPEAR_LABELS: Record<AppearAnimation, string> = {
  none: "None",
  fade: "Fade in",
  fadeUp: "Fade up",
  fadeDown: "Fade down",
  fadeLeft: "Slide from left",
  fadeRight: "Slide from right",
  zoom: "Zoom in",
}

export type AppearStyle = {
  animation: AppearAnimation
  /** Milliseconds. */
  duration: number
  delay: number
}

export type PositionStyle = {
  sticky: boolean
  top: number
  zIndex: number
}

export type ElementStyle = {
  margin: Responsive<Sides>
  padding: Responsive<Sides>
  maxWidth: number | null
  minHeight: Responsive<number>
  /** How the element sits in its parent when it is narrower than it. */
  align: "left" | "center" | "right"
  layout: LayoutStyle
  background: Background
  border: BorderStyle
  shadow: ShadowPreset
  typography: Typography
  effects: Effects
  hover: HoverStyle
  appear: AppearStyle
  position: PositionStyle
  overflowHidden: boolean
  /** Forces light or dark text; "auto" leaves the page defaults alone. */
  textTone: "auto" | "light" | "dark"
  hideOn: Device[]
}

// Kept as aliases so existing imports keep reading naturally.
export type SectionStyle = ElementStyle
export type BlockStyle = ElementStyle

// ── Defaults ─────────────────────────────────────────────────────────

export function sides(value = 0): Sides {
  return { top: value, right: value, bottom: value, left: value }
}

export function responsive<T>(desktop: T): Responsive<T> {
  return { desktop, tablet: null, mobile: null }
}

export function defaultBackground(): Background {
  return {
    kind: "none",
    color: "#ffffff",
    gradientFrom: "#0f5132",
    gradientTo: "#157347",
    gradientAngle: 135,
    imageUrl: "",
    imagePublicId: "",
    imagePosition: "center",
    imageSize: "cover",
    imageFixed: false,
    overlay: 0,
  }
}

export function defaultElementStyle(): ElementStyle {
  return {
    margin: responsive(sides(0)),
    padding: responsive(sides(0)),
    maxWidth: null,
    minHeight: responsive(0),
    align: "left",
    layout: {
      direction: "column",
      gap: responsive(16),
      justify: "start",
      alignItems: "stretch",
      wrap: false,
      columns: responsive(0),
    },
    background: defaultBackground(),
    border: { width: 0, style: "none", color: "#e5e7eb", radius: 0 },
    shadow: "none",
    typography: {
      family: "inherit",
      size: responsive(0),
      weight: 0,
      lineHeight: 0,
      letterSpacing: 0,
      transform: "none",
      color: "",
      align: "inherit",
    },
    effects: { opacity: 100, blur: 0, rotate: 0, scale: 100 },
    hover: {
      enabled: false,
      opacity: null,
      scale: null,
      shadow: null,
      color: "",
      background: "",
      transition: 200,
    },
    appear: { animation: "none", duration: 600, delay: 0 },
    position: { sticky: false, top: 0, zIndex: 0 },
    overflowHidden: false,
    textTone: "auto",
    hideOn: [],
  }
}

export const defaultBlockStyle = defaultElementStyle
export const defaultSectionStyle = defaultElementStyle

// ── Normalising untrusted input ──────────────────────────────────────
// Styles arrive from the editor as JSON and are stored as Mixed, so every read
// has to assume the shape might be wrong, missing, or from an older version.

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function normalizeSides(value: unknown, fallback = 0): Sides {
  const raw = (value ?? {}) as Partial<Sides>
  return {
    top: num(raw.top, fallback, -400, 400),
    right: num(raw.right, fallback, -400, 400),
    bottom: num(raw.bottom, fallback, -400, 400),
    left: num(raw.left, fallback, -400, 400),
  }
}

function normalizeResponsiveSides(value: unknown): Responsive<Sides> {
  const raw = (value ?? {}) as Partial<Responsive<Sides>>
  return {
    desktop: normalizeSides(raw.desktop),
    tablet: raw.tablet == null ? null : normalizeSides(raw.tablet),
    mobile: raw.mobile == null ? null : normalizeSides(raw.mobile),
  }
}

function normalizeResponsiveNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): Responsive<number> {
  const raw = (value ?? {}) as Partial<Responsive<number>>
  return {
    desktop: num(raw.desktop, fallback, min, max),
    tablet: raw.tablet == null ? null : num(raw.tablet, fallback, min, max),
    mobile: raw.mobile == null ? null : num(raw.mobile, fallback, min, max),
  }
}

/** Only `#rgb`/`#rrggbb` gets through, so a style value can never inject CSS. */
export function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback
}

/** Same idea for URLs: a background must not become `url(javascript:…)`. */
export function safeImageUrl(value: unknown) {
  if (typeof value !== "string") return ""
  const url = value.trim()
  if (!url) return ""
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return ""
  // Anything that could close the url() and start a new declaration.
  if (/["'()\\\s]/.test(url)) return ""
  return url
}

export const POSITIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
]

function normalizeBackground(value: unknown): Background {
  const raw = (value ?? {}) as Partial<Background>
  return {
    kind: pick(raw.kind, ["none", "color", "image", "gradient"] as const, "none"),
    color: safeColor(raw.color, "#ffffff"),
    gradientFrom: safeColor(raw.gradientFrom, "#0f5132"),
    gradientTo: safeColor(raw.gradientTo, "#157347"),
    gradientAngle: num(raw.gradientAngle, 135, 0, 360),
    imageUrl: safeImageUrl(raw.imageUrl),
    imagePublicId: typeof raw.imagePublicId === "string" ? raw.imagePublicId : "",
    imagePosition: POSITIONS.includes(raw.imagePosition as string)
      ? (raw.imagePosition as string)
      : "center",
    imageSize: pick(raw.imageSize, ["cover", "contain", "auto"] as const, "cover"),
    imageFixed: raw.imageFixed === true,
    overlay: num(raw.overlay, 0, 0, 100),
  }
}

export function normalizeElementStyle(value: unknown): ElementStyle {
  const raw = (value ?? {}) as Partial<ElementStyle>
  const base = defaultElementStyle()

  const layout = (raw.layout ?? {}) as Partial<LayoutStyle>
  const border = (raw.border ?? {}) as Partial<BorderStyle>
  const type = (raw.typography ?? {}) as Partial<Typography>
  const effects = (raw.effects ?? {}) as Partial<Effects>
  const hover = (raw.hover ?? {}) as Partial<HoverStyle>
  const appear = (raw.appear ?? {}) as Partial<AppearStyle>
  const position = (raw.position ?? {}) as Partial<PositionStyle>

  const hideOn = Array.isArray(raw.hideOn)
    ? raw.hideOn.filter((device): device is Device =>
        (DEVICES as readonly string[]).includes(device as string)
      )
    : []

  return {
    margin: normalizeResponsiveSides(raw.margin),
    padding: normalizeResponsiveSides(raw.padding),
    maxWidth:
      typeof raw.maxWidth === "number" && raw.maxWidth > 0
        ? num(raw.maxWidth, 640, 80, 2400)
        : null,
    minHeight: normalizeResponsiveNumber(raw.minHeight, 0, 0, 4000),
    align: pick(raw.align, ["left", "center", "right"] as const, "left"),
    layout: {
      direction: pick(layout.direction, ["column", "row"] as const, "column"),
      gap: normalizeResponsiveNumber(layout.gap, base.layout.gap.desktop, 0, 200),
      justify: pick(
        layout.justify,
        ["start", "center", "end", "between", "around"] as const,
        "start"
      ),
      alignItems: pick(
        layout.alignItems,
        ["stretch", "start", "center", "end"] as const,
        "stretch"
      ),
      wrap: layout.wrap === true,
      columns: normalizeResponsiveNumber(layout.columns, 0, 0, 6),
    },
    background: normalizeBackground(raw.background),
    border: {
      width: num(border.width, 0, 0, 40),
      style: pick(border.style, ["none", "solid", "dashed", "dotted"] as const, "none"),
      color: safeColor(border.color, "#e5e7eb"),
      radius: num(border.radius, 0, 0, 200),
    },
    shadow: pick(raw.shadow, SHADOW_PRESETS, "none"),
    typography: {
      family: pick(type.family, FONT_FAMILIES, "inherit"),
      size: normalizeResponsiveNumber(type.size, 0, 0, 200),
      weight: num(type.weight, 0, 0, 900),
      lineHeight: num(type.lineHeight, 0, 0, 400),
      letterSpacing: num(type.letterSpacing, 0, -20, 40),
      transform: pick(
        type.transform,
        ["none", "uppercase", "lowercase", "capitalize"] as const,
        "none"
      ),
      color: typeof type.color === "string" && type.color ? safeColor(type.color, "") : "",
      align: pick(
        type.align,
        ["inherit", "left", "center", "right", "justify"] as const,
        "inherit"
      ),
    },
    effects: {
      opacity: num(effects.opacity, 100, 0, 100),
      blur: num(effects.blur, 0, 0, 40),
      rotate: num(effects.rotate, 0, -180, 180),
      scale: num(effects.scale, 100, 10, 300),
    },
    hover: {
      enabled: hover.enabled === true,
      opacity: hover.opacity == null ? null : num(hover.opacity, 100, 0, 100),
      scale: hover.scale == null ? null : num(hover.scale, 100, 10, 300),
      shadow: hover.shadow == null ? null : pick(hover.shadow, SHADOW_PRESETS, "none"),
      color: typeof hover.color === "string" && hover.color ? safeColor(hover.color, "") : "",
      background:
        typeof hover.background === "string" && hover.background
          ? safeColor(hover.background, "")
          : "",
      transition: num(hover.transition, 200, 0, 2000),
    },
    appear: {
      animation: pick(appear.animation, APPEAR_ANIMATIONS, "none"),
      duration: num(appear.duration, 600, 100, 3000),
      delay: num(appear.delay, 0, 0, 3000),
    },
    position: {
      sticky: position.sticky === true,
      top: num(position.top, 0, 0, 400),
      zIndex: num(position.zIndex, 0, 0, 100),
    },
    overflowHidden: raw.overflowHidden === true,
    textTone: pick(raw.textTone, ["auto", "light", "dark"] as const, "auto"),
    hideOn: [...new Set(hideOn)],
  }
}

export const normalizeBlockStyle = normalizeElementStyle
export const normalizeSectionStyle = normalizeElementStyle

// ── CSS generation ───────────────────────────────────────────────────

const SHADOWS: Record<ShadowPreset, string> = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.06)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
  lg: "0 12px 28px -6px rgb(0 0 0 / 0.16), 0 4px 10px -4px rgb(0 0 0 / 0.08)",
  xl: "0 28px 60px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 6px 0 rgb(0 0 0 / 0.12)",
}

const FONT_STACKS: Record<FontFamily, string> = {
  inherit: "",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
}

const JUSTIFY: Record<LayoutStyle["justify"], string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
}

const ALIGN_ITEMS: Record<LayoutStyle["alignItems"], string> = {
  stretch: "stretch",
  start: "flex-start",
  center: "center",
  end: "flex-end",
}

const SELF_MARGIN: Record<ElementStyle["align"], string> = {
  left: "margin-inline-end:auto",
  center: "margin-inline:auto",
  right: "margin-inline-start:auto",
}

function sidesCss(prefix: "margin" | "padding", value: Sides) {
  return [
    `${prefix}-top:${value.top}px`,
    `${prefix}-right:${value.right}px`,
    `${prefix}-bottom:${value.bottom}px`,
    `${prefix}-left:${value.left}px`,
  ].join(";")
}

function transformCss(effects: Effects) {
  const parts: string[] = []
  if (effects.rotate !== 0) parts.push(`rotate(${effects.rotate}deg)`)
  if (effects.scale !== 100) parts.push(`scale(${effects.scale / 100})`)
  return parts.join(" ")
}

/**
 * Declarations that are not per-device.
 *
 * `part` says which half of a section this is for. A section paints its
 * background on the shell but pads its *content*, so a full-bleed photo can
 * sit behind a column that is only 1100px wide — the split is what makes that
 * possible. A widget is a single element and takes the lot.
 */
type Part = "all" | "shell" | "inner"

function staticDeclarations(style: ElementStyle, part: Part): string[] {
  const out: string[] = ["position:relative"]

  if (part !== "shell" && style.maxWidth) {
    out.push(`max-width:${style.maxWidth}px`, "width:100%", SELF_MARGIN[style.align])
  }

  if (part === "inner") {
    // Everything below belongs to the painted shell, not the content column.
    return out
  }

  const bg = style.background
  if (bg.kind === "color") {
    out.push(`background-color:${bg.color}`)
  } else if (bg.kind === "gradient") {
    out.push(
      `background-image:linear-gradient(${bg.gradientAngle}deg,${bg.gradientFrom},${bg.gradientTo})`
    )
  } else if (bg.kind === "image" && bg.imageUrl) {
    out.push(
      `background-image:url(${bg.imageUrl})`,
      `background-size:${bg.imageSize}`,
      `background-position:${bg.imagePosition}`,
      "background-repeat:no-repeat",
      bg.imageFixed ? "background-attachment:fixed" : "background-attachment:scroll"
    )
  }

  if (style.border.style !== "none" && style.border.width > 0) {
    out.push(`border:${style.border.width}px ${style.border.style} ${style.border.color}`)
  }
  if (style.border.radius > 0) out.push(`border-radius:${style.border.radius}px`)
  if (style.overflowHidden || style.border.radius > 0) out.push("overflow:hidden")

  if (style.shadow !== "none") out.push(`box-shadow:${SHADOWS[style.shadow]}`)

  const type = style.typography
  if (type.family !== "inherit") out.push(`font-family:${FONT_STACKS[type.family]}`)
  if (type.weight > 0) out.push(`font-weight:${type.weight}`)
  if (type.lineHeight > 0) out.push(`line-height:${type.lineHeight / 100}`)
  if (type.letterSpacing !== 0) out.push(`letter-spacing:${type.letterSpacing / 10}px`)
  if (type.transform !== "none") out.push(`text-transform:${type.transform}`)
  if (type.color) out.push(`color:${type.color}`)
  if (type.align !== "inherit") out.push(`text-align:${type.align}`)

  if (style.effects.opacity !== 100) out.push(`opacity:${style.effects.opacity / 100}`)
  if (style.effects.blur > 0) out.push(`filter:blur(${style.effects.blur}px)`)

  const transform = transformCss(style.effects)
  if (transform) out.push(`transform:${transform}`)

  if (style.position.sticky) out.push("position:sticky", `top:${style.position.top}px`)
  if (style.position.zIndex > 0) out.push(`z-index:${style.position.zIndex}`)

  // A shell stacks its single inner child, so min-height has something to
  // stretch and the content column can fill it.
  if (part === "shell") out.push("display:flex", "flex-direction:column")

  if (style.hover.enabled) {
    out.push(
      `transition:opacity ${style.hover.transition}ms ease,transform ${style.hover.transition}ms ease,box-shadow ${style.hover.transition}ms ease,color ${style.hover.transition}ms ease,background-color ${style.hover.transition}ms ease`
    )
  }

  return out
}

/** Declarations that can differ per device. */
function deviceDeclarations(style: ElementStyle, device: Device, part: Part): string[] {
  const out: string[] = []

  function at<T>(value: Responsive<T>): T | null {
    return device === "desktop" ? value.desktop : value[device]
  }

  const margin = at(style.margin)
  const padding = at(style.padding)
  const minHeight = at(style.minHeight)
  const gap = at(style.layout.gap)
  const columns = at(style.layout.columns)
  const size = at(style.typography.size)

  if (part !== "inner") {
    if (margin) out.push(sidesCss("margin", margin))
    if (minHeight != null && (device !== "desktop" || minHeight > 0)) {
      out.push(`min-height:${minHeight}px`)
    }
    if (size != null && size > 0) out.push(`font-size:${size}px`)
  }

  if (part !== "shell" && padding) {
    out.push(sidesCss("padding", padding))
  }

  // Only the content wrapper lays its children out.
  if (part === "inner") {
    if (device === "desktop") out.push("flex:1")

    if (columns != null && columns > 0) {
      out.push("display:grid", `grid-template-columns:repeat(${columns},minmax(0,1fr))`)
      if (device === "desktop") out.push(`align-items:${ALIGN_ITEMS[style.layout.alignItems]}`)
    } else if (device === "desktop" || columns === 0) {
      out.push(
        "display:flex",
        `flex-direction:${style.layout.direction}`,
        `justify-content:${JUSTIFY[style.layout.justify]}`,
        `align-items:${ALIGN_ITEMS[style.layout.alignItems]}`,
        style.layout.wrap ? "flex-wrap:wrap" : "flex-wrap:nowrap",
        "grid-template-columns:none"
      )
    }

    if (gap != null) out.push(`gap:${gap}px`)
  }

  return out
}

function hoverCss(selector: string, style: ElementStyle): string {
  if (!style.hover.enabled) return ""

  const out: string[] = []
  if (style.hover.opacity != null) out.push(`opacity:${style.hover.opacity / 100}`)
  if (style.hover.shadow) out.push(`box-shadow:${SHADOWS[style.hover.shadow]}`)
  if (style.hover.color) out.push(`color:${style.hover.color}`)
  if (style.hover.background) out.push(`background-color:${style.hover.background}`)

  if (style.hover.scale != null) {
    const parts: string[] = []
    if (style.effects.rotate !== 0) parts.push(`rotate(${style.effects.rotate}deg)`)
    parts.push(`scale(${style.hover.scale / 100})`)
    out.push(`transform:${parts.join(" ")}`)
  }

  return out.length > 0 ? `${selector}:hover{${out.join(";")}}` : ""
}

const APPEAR_FROM: Record<Exclude<AppearAnimation, "none">, string> = {
  fade: "opacity:0",
  fadeUp: "opacity:0;transform:translateY(24px)",
  fadeDown: "opacity:0;transform:translateY(-24px)",
  fadeLeft: "opacity:0;transform:translateX(-24px)",
  fadeRight: "opacity:0;transform:translateX(24px)",
  zoom: "opacity:0;transform:scale(0.94)",
}

/**
 * The appear animation.
 *
 * The element starts in its "from" state and is released by a `data-appear`
 * flag that `AppearWatcher` sets when it scrolls into view. The "from" rules
 * are scoped to `[data-appear-ready]`, which that same script adds, so a page
 * whose JavaScript never runs shows its content rather than hiding it. All of
 * it sits behind `prefers-reduced-motion`.
 */
function appearCss(selector: string, style: ElementStyle): string {
  if (style.appear.animation === "none") return ""

  const from = APPEAR_FROM[style.appear.animation]

  return (
    `@media (prefers-reduced-motion:no-preference){` +
    `[data-appear-ready] ${selector}{${from};transition:opacity ${style.appear.duration}ms ease-out ${style.appear.delay}ms,transform ${style.appear.duration}ms ease-out ${style.appear.delay}ms}` +
    `[data-appear-ready] ${selector}[data-appear="in"]{opacity:1;transform:none}` +
    `}`
  )
}

function hideCss(selector: string, hideOn: Device[]): string {
  return hideOn
    .map((device) => {
      if (device === "desktop") {
        return `@container (min-width:${DEVICE_BREAKPOINTS.tablet + 1}px){${selector}{display:none}}`
      }
      if (device === "tablet") {
        return `@container (min-width:${DEVICE_BREAKPOINTS.mobile + 1}px) and (max-width:${DEVICE_BREAKPOINTS.tablet}px){${selector}{display:none}}`
      }
      return `@container (max-width:${DEVICE_BREAKPOINTS.mobile}px){${selector}{display:none}}`
    })
    .join("")
}

function compose(selector: string, style: ElementStyle, part: Part): string {
  const rules: string[] = []

  const base = [...staticDeclarations(style, part), ...deviceDeclarations(style, "desktop", part)]
  rules.push(`${selector}{${base.join(";")}}`)

  for (const device of ["tablet", "mobile"] as const) {
    const overrides = deviceDeclarations(style, device, part)
    if (overrides.length > 0) {
      rules.push(
        `@container (max-width:${DEVICE_BREAKPOINTS[device]}px){${selector}{${overrides.join(";")}}}`
      )
    }
  }

  if (part !== "inner") {
    const bg = style.background
    if (bg.kind === "image" && bg.imageUrl && bg.overlay > 0) {
      rules.push(
        `${selector}::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,${(
          bg.overlay / 100
        ).toFixed(2)});pointer-events:none}`
      )
    }

    rules.push(hoverCss(selector, style))
    rules.push(appearCss(selector, style))
    // Hiding is last so it beats every display rule above.
    rules.push(hideCss(selector, style.hideOn))
  }

  return rules.filter(Boolean).join("")
}

/** All the CSS for one widget. */
export function elementCss(selector: string, style: ElementStyle): string {
  return compose(selector, style, "all")
}

export const blockStyleCss = elementCss

/** The painted outer band of a section. */
export function sectionShellCss(selector: string, style: ElementStyle): string {
  return compose(selector, style, "shell")
}

/** The padded content column inside a section, and how it stacks its widgets. */
export function sectionInnerCss(selector: string, style: ElementStyle): string {
  return compose(selector, style, "inner")
}

/** Forced text colour, applied to the element and everything inside it. */
export function toneClass(tone: ElementStyle["textTone"]) {
  if (tone === "light") return "cms-tone-light"
  if (tone === "dark") return "cms-tone-dark"
  return ""
}

/** Ids come from the editor, but a class name must never carry a selector. */
export function safeStyleId(id: string) {
  return id.replace(/[^A-Za-z0-9_-]/g, "")
}
