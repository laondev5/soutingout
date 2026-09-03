"use client"

import { useState } from "react"
import { ChevronDown, Link2, Link2Off } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ImageUploader } from "@/components/ImageUploader"
import {
  APPEAR_ANIMATIONS,
  APPEAR_LABELS,
  DEVICES,
  DEVICE_LABELS,
  FONT_FAMILIES,
  POSITIONS,
  SHADOW_PRESETS,
  defaultElementStyle,
  normalizeElementStyle,
  sides,
  type Device,
  type ElementStyle,
  type Responsive,
  type Sides,
} from "@/lib/cms-style"
import { cn } from "@/lib/utils"

/**
 * The Style tab of the inspector.
 *
 * Spacing, size, gap and font size are edited per device: pick Tablet in the
 * toolbar and the numbers you type become tablet overrides, leaving desktop
 * alone. Clearing an override falls back to the wider device, which is what
 * "inherit" means here.
 *
 * A section shows every group; a widget hides the ones that only make sense
 * for something that contains other things.
 */

// ── Small pieces ─────────────────────────────────────────────────────

function Group({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {title}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="space-y-3 pb-4">{children}</div> : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function NumberBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: number | ""
  onChange: (next: number | null) => void
  placeholder?: string
  ariaLabel: string
}) {
  return (
    <Input
      type="number"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(event) => {
        const raw = event.target.value
        onChange(raw === "" ? null : Number(raw))
      }}
      className="h-8 px-2 text-center text-xs"
    />
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <Row label={label}>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
}) {
  return (
    <Row label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </Row>
  )
}

function ColorField({
  label,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  allowEmpty?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {allowEmpty && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Inherit
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          value={value}
          placeholder={allowEmpty ? "Inherit" : undefined}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} hex value`}
          className="h-8 min-w-0 flex-1 px-2 font-mono text-xs"
        />
      </div>
    </div>
  )
}

/**
 * A four-sided box editor with a link toggle, the way every design tool does
 * it: linked types all four at once, unlinked lets each side differ.
 */
function SidesEditor({
  label,
  value,
  inherited,
  onChange,
  onClear,
  linked,
  onToggleLinked,
}: {
  label: string
  value: Sides | null
  inherited: Sides
  onChange: (next: Sides) => void
  onClear: () => void
  linked: boolean
  onToggleLinked: () => void
}) {
  const shown = value ?? inherited
  const isOverride = value !== null

  function set(side: keyof Sides, next: number | null) {
    const base = value ?? { ...inherited }
    const amount = next ?? 0
    onChange(linked ? sides(amount) : { ...base, [side]: amount })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          {isOverride ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleLinked}
            aria-pressed={linked}
            title={linked ? "Edit each side separately" : "Edit all sides together"}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted",
              linked && "bg-muted text-foreground"
            )}
          >
            {linked ? <Link2 className="size-3" /> : <Link2Off className="size-3" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <div key={side} className="space-y-0.5">
            <NumberBox
              ariaLabel={`${label} ${side}`}
              value={isOverride ? shown[side] : ""}
              placeholder={String(inherited[side])}
              onChange={(next) => set(side, next)}
            />
            <p className="text-center text-[10px] uppercase text-muted-foreground">
              {side.slice(0, 1)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Responsive helpers ───────────────────────────────────────────────

function effective<T>(value: Responsive<T>, device: Device): T {
  if (device === "desktop") return value.desktop
  if (device === "tablet") return value.tablet ?? value.desktop
  return value.mobile ?? value.tablet ?? value.desktop
}

function at<T>(value: Responsive<T>, device: Device): T | null {
  return device === "desktop" ? value.desktop : value[device]
}

function setFor<T>(value: Responsive<T>, device: Device, next: T | null): Responsive<T> {
  if (device === "desktop") return { ...value, desktop: next ?? value.desktop }
  return { ...value, [device]: next }
}

// ── The panel ────────────────────────────────────────────────────────

export function StylePanel({
  style,
  device,
  isSection,
  onChange,
}: {
  style: ElementStyle | undefined
  device: Device
  /** Sections get the layout group; widgets do not lay anything out. */
  isSection: boolean
  onChange: (next: ElementStyle) => void
}) {
  const s = style ? normalizeElementStyle(style) : defaultElementStyle()
  const [linked, setLinked] = useState(true)
  const deviceName = DEVICE_LABELS[device].toLowerCase()

  const set = (patch: Partial<ElementStyle>) => onChange({ ...s, ...patch })
  const bg = s.background

  return (
    <div className="divide-y">
      {isSection ? (
        <Group title="Layout" defaultOpen>
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Direction"
              value={s.layout.direction}
              options={[
                { value: "column", label: "Stack (vertical)" },
                { value: "row", label: "Row (horizontal)" },
              ]}
              onChange={(direction) => set({ layout: { ...s.layout, direction } })}
            />
            <Row label={`Columns — ${deviceName}`}>
              <NumberBox
                ariaLabel="Grid columns"
                value={at(s.layout.columns, device) ?? ""}
                placeholder={String(effective(s.layout.columns, device) || 0)}
                onChange={(next) =>
                  set({ layout: { ...s.layout, columns: setFor(s.layout.columns, device, next) } })
                }
              />
            </Row>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            0 columns stacks or rows the widgets. 1 or more switches to a grid — set 1 on mobile so
            a three-column row becomes a single column on a phone.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Row label={`Gap — ${deviceName}`}>
              <NumberBox
                ariaLabel="Gap"
                value={at(s.layout.gap, device) ?? ""}
                placeholder={String(effective(s.layout.gap, device))}
                onChange={(next) =>
                  set({ layout: { ...s.layout, gap: setFor(s.layout.gap, device, next) } })
                }
              />
            </Row>
            <Select
              label="Distribute"
              value={s.layout.justify}
              options={[
                { value: "start", label: "Start" },
                { value: "center", label: "Centre" },
                { value: "end", label: "End" },
                { value: "between", label: "Space between" },
                { value: "around", label: "Space around" },
              ]}
              onChange={(justify) => set({ layout: { ...s.layout, justify } })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Align"
              value={s.layout.alignItems}
              options={[
                { value: "stretch", label: "Stretch" },
                { value: "start", label: "Start" },
                { value: "center", label: "Centre" },
                { value: "end", label: "End" },
              ]}
              onChange={(alignItems) => set({ layout: { ...s.layout, alignItems } })}
            />
            <label className="flex items-end gap-2 pb-1 text-xs">
              <Checkbox
                checked={s.layout.wrap}
                onCheckedChange={(checked) =>
                  set({ layout: { ...s.layout, wrap: checked === true } })
                }
              />
              Wrap
            </label>
          </div>
        </Group>
      ) : null}

      <Group title="Spacing" defaultOpen>
        <SidesEditor
          label={`Padding — ${deviceName}`}
          value={at(s.padding, device)}
          inherited={effective(s.padding, device)}
          linked={linked}
          onToggleLinked={() => setLinked((value) => !value)}
          onChange={(next) => set({ padding: setFor(s.padding, device, next) })}
          onClear={() => set({ padding: setFor(s.padding, device, null) })}
        />
        <SidesEditor
          label={`Margin — ${deviceName}`}
          value={at(s.margin, device)}
          inherited={effective(s.margin, device)}
          linked={linked}
          onToggleLinked={() => setLinked((value) => !value)}
          onChange={(next) => set({ margin: setFor(s.margin, device, next) })}
          onClear={() => set({ margin: setFor(s.margin, device, null) })}
        />
      </Group>

      <Group title="Size">
        <div className="grid grid-cols-2 gap-2">
          <Row label={isSection ? "Content width (px)" : "Max width (px)"}>
            <NumberBox
              ariaLabel="Max width"
              value={s.maxWidth ?? ""}
              placeholder="Full"
              onChange={(next) => set({ maxWidth: next })}
            />
          </Row>
          <Row label={`Min height — ${deviceName}`}>
            <NumberBox
              ariaLabel="Minimum height"
              value={at(s.minHeight, device) || ""}
              placeholder={String(effective(s.minHeight, device))}
              onChange={(next) => set({ minHeight: setFor(s.minHeight, device, next) })}
            />
          </Row>
        </div>
        {!isSection ? (
          <Select
            label="Position in section"
            value={s.align}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Centre" },
              { value: "right", label: "Right" },
            ]}
            onChange={(align) => set({ align })}
          />
        ) : null}
      </Group>

      <Group title="Typography">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Font"
            value={s.typography.family}
            options={FONT_FAMILIES.map((family) => ({
              value: family,
              label:
                family === "inherit"
                  ? "Page default"
                  : family === "sans"
                    ? "Sans serif"
                    : family === "serif"
                      ? "Serif"
                      : "Monospace",
            }))}
            onChange={(family) => set({ typography: { ...s.typography, family } })}
          />
          <Row label={`Size — ${deviceName}`}>
            <NumberBox
              ariaLabel="Font size"
              value={at(s.typography.size, device) || ""}
              placeholder={String(effective(s.typography.size, device) || "Auto")}
              onChange={(next) =>
                set({ typography: { ...s.typography, size: setFor(s.typography.size, device, next) } })
              }
            />
          </Row>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Weight"
            value={String(s.typography.weight)}
            options={[
              { value: "0", label: "Default" },
              { value: "300", label: "Light" },
              { value: "400", label: "Regular" },
              { value: "500", label: "Medium" },
              { value: "600", label: "Semi bold" },
              { value: "700", label: "Bold" },
              { value: "800", label: "Extra bold" },
            ]}
            onChange={(weight) => set({ typography: { ...s.typography, weight: Number(weight) } })}
          />
          <Select
            label="Text align"
            value={s.typography.align}
            options={[
              { value: "inherit", label: "Default" },
              { value: "left", label: "Left" },
              { value: "center", label: "Centre" },
              { value: "right", label: "Right" },
              { value: "justify", label: "Justified" },
            ]}
            onChange={(align) => set({ typography: { ...s.typography, align } })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Row label="Line height (%)">
            <NumberBox
              ariaLabel="Line height"
              value={s.typography.lineHeight || ""}
              placeholder="Auto"
              onChange={(next) =>
                set({ typography: { ...s.typography, lineHeight: next ?? 0 } })
              }
            />
          </Row>
          <Row label="Letter spacing (÷10 px)">
            <NumberBox
              ariaLabel="Letter spacing"
              value={s.typography.letterSpacing || ""}
              placeholder="0"
              onChange={(next) =>
                set({ typography: { ...s.typography, letterSpacing: next ?? 0 } })
              }
            />
          </Row>
        </div>

        <Select
          label="Capitalisation"
          value={s.typography.transform}
          options={[
            { value: "none", label: "As typed" },
            { value: "uppercase", label: "UPPERCASE" },
            { value: "lowercase", label: "lowercase" },
            { value: "capitalize", label: "Title Case" },
          ]}
          onChange={(transform) => set({ typography: { ...s.typography, transform } })}
        />

        <ColorField
          label="Text colour"
          value={s.typography.color}
          allowEmpty
          onChange={(color) => set({ typography: { ...s.typography, color } })}
        />

        <Select
          label="Force light or dark text"
          value={s.textTone}
          options={[
            { value: "auto", label: "Automatic" },
            { value: "light", label: "Light (on a dark background)" },
            { value: "dark", label: "Dark (on a light background)" },
          ]}
          onChange={(textTone) => set({ textTone })}
        />
      </Group>

      <Group title="Background">
        <Select
          label="Type"
          value={bg.kind}
          options={[
            { value: "none", label: "None" },
            { value: "color", label: "Solid colour" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Image" },
          ]}
          onChange={(kind) => set({ background: { ...bg, kind } })}
        />

        {bg.kind === "color" ? (
          <ColorField
            label="Colour"
            value={bg.color}
            onChange={(color) => set({ background: { ...bg, color } })}
          />
        ) : null}

        {bg.kind === "gradient" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ColorField
                label="From"
                value={bg.gradientFrom}
                onChange={(gradientFrom) => set({ background: { ...bg, gradientFrom } })}
              />
              <ColorField
                label="To"
                value={bg.gradientTo}
                onChange={(gradientTo) => set({ background: { ...bg, gradientTo } })}
              />
            </div>
            <Slider
              label={`Angle — ${bg.gradientAngle}°`}
              value={bg.gradientAngle}
              min={0}
              max={360}
              onChange={(gradientAngle) => set({ background: { ...bg, gradientAngle } })}
            />
          </>
        ) : null}

        {bg.kind === "image" ? (
          <>
            <ImageUploader
              kind="accommodation"
              max={1}
              label="Upload background"
              images={bg.imageUrl ? [{ url: bg.imageUrl, publicId: bg.imagePublicId }] : []}
              onChange={(images) =>
                set({
                  background: {
                    ...bg,
                    imageUrl: images[0]?.url ?? "",
                    imagePublicId: images[0]?.publicId ?? "",
                  },
                })
              }
            />

            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Position"
                value={bg.imagePosition}
                options={POSITIONS.map((position) => ({ value: position, label: position }))}
                onChange={(imagePosition) => set({ background: { ...bg, imagePosition } })}
              />
              <Select
                label="Fit"
                value={bg.imageSize}
                options={[
                  { value: "cover", label: "Cover" },
                  { value: "contain", label: "Contain" },
                  { value: "auto", label: "Original size" },
                ]}
                onChange={(imageSize) => set({ background: { ...bg, imageSize } })}
              />
            </div>

            <Slider
              label={`Dark overlay — ${bg.overlay}%`}
              value={bg.overlay}
              min={0}
              max={100}
              onChange={(overlay) => set({ background: { ...bg, overlay } })}
            />

            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={bg.imageFixed}
                onCheckedChange={(checked) =>
                  set({ background: { ...bg, imageFixed: checked === true } })
                }
              />
              Hold still while the page scrolls
            </label>
          </>
        ) : null}
      </Group>

      <Group title="Border &amp; shadow">
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Border style"
            value={s.border.style}
            options={[
              { value: "none", label: "None" },
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ]}
            onChange={(style) => set({ border: { ...s.border, style } })}
          />
          <Row label="Width (px)">
            <NumberBox
              ariaLabel="Border width"
              value={s.border.width || ""}
              placeholder="0"
              onChange={(next) => set({ border: { ...s.border, width: next ?? 0 } })}
            />
          </Row>
        </div>

        {s.border.style !== "none" ? (
          <ColorField
            label="Border colour"
            value={s.border.color}
            onChange={(color) => set({ border: { ...s.border, color } })}
          />
        ) : null}

        <Slider
          label={`Corner radius — ${s.border.radius}px`}
          value={s.border.radius}
          min={0}
          max={80}
          onChange={(radius) => set({ border: { ...s.border, radius } })}
        />

        <Select
          label="Shadow"
          value={s.shadow}
          options={SHADOW_PRESETS.map((preset) => ({
            value: preset,
            label:
              preset === "none"
                ? "None"
                : preset === "inner"
                  ? "Inner"
                  : `${preset.toUpperCase()}`,
          }))}
          onChange={(shadow) => set({ shadow })}
        />

        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={s.overflowHidden}
            onCheckedChange={(checked) => set({ overflowHidden: checked === true })}
          />
          Clip anything that overflows
        </label>
      </Group>

      <Group title="Effects">
        <Slider
          label={`Opacity — ${s.effects.opacity}%`}
          value={s.effects.opacity}
          min={0}
          max={100}
          onChange={(opacity) => set({ effects: { ...s.effects, opacity } })}
        />
        <Slider
          label={`Blur — ${s.effects.blur}px`}
          value={s.effects.blur}
          min={0}
          max={30}
          onChange={(blur) => set({ effects: { ...s.effects, blur } })}
        />
        <Slider
          label={`Rotate — ${s.effects.rotate}°`}
          value={s.effects.rotate}
          min={-180}
          max={180}
          onChange={(rotate) => set({ effects: { ...s.effects, rotate } })}
        />
        <Slider
          label={`Scale — ${s.effects.scale}%`}
          value={s.effects.scale}
          min={25}
          max={200}
          onChange={(scale) => set({ effects: { ...s.effects, scale } })}
        />
      </Group>

      <Group title="Hover">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={s.hover.enabled}
            onCheckedChange={(checked) =>
              set({ hover: { ...s.hover, enabled: checked === true } })
            }
          />
          Change on hover
        </label>

        {s.hover.enabled ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Row label="Opacity (%)">
                <NumberBox
                  ariaLabel="Hover opacity"
                  value={s.hover.opacity ?? ""}
                  placeholder="No change"
                  onChange={(opacity) => set({ hover: { ...s.hover, opacity } })}
                />
              </Row>
              <Row label="Scale (%)">
                <NumberBox
                  ariaLabel="Hover scale"
                  value={s.hover.scale ?? ""}
                  placeholder="No change"
                  onChange={(scale) => set({ hover: { ...s.hover, scale } })}
                />
              </Row>
            </div>

            <Select
              label="Shadow"
              value={s.hover.shadow ?? ""}
              options={[
                { value: "", label: "No change" },
                ...SHADOW_PRESETS.map((preset) => ({ value: preset, label: preset })),
              ]}
              onChange={(shadow) =>
                set({
                  hover: {
                    ...s.hover,
                    shadow: shadow === "" ? null : (shadow as (typeof SHADOW_PRESETS)[number]),
                  },
                })
              }
            />

            <ColorField
              label="Text colour"
              value={s.hover.color}
              allowEmpty
              onChange={(color) => set({ hover: { ...s.hover, color } })}
            />
            <ColorField
              label="Background"
              value={s.hover.background}
              allowEmpty
              onChange={(background) => set({ hover: { ...s.hover, background } })}
            />

            <Slider
              label={`Transition — ${s.hover.transition}ms`}
              value={s.hover.transition}
              min={0}
              max={1200}
              step={50}
              onChange={(transition) => set({ hover: { ...s.hover, transition } })}
            />
          </>
        ) : null}
      </Group>

      <Group title="Scroll animation">
        <Select
          label="Appear as it scrolls in"
          value={s.appear.animation}
          options={APPEAR_ANIMATIONS.map((animation) => ({
            value: animation,
            label: APPEAR_LABELS[animation],
          }))}
          onChange={(animation) => set({ appear: { ...s.appear, animation } })}
        />

        {s.appear.animation !== "none" ? (
          <div className="grid grid-cols-2 gap-2">
            <Row label="Duration (ms)">
              <NumberBox
                ariaLabel="Animation duration"
                value={s.appear.duration}
                onChange={(duration) => set({ appear: { ...s.appear, duration: duration ?? 600 } })}
              />
            </Row>
            <Row label="Delay (ms)">
              <NumberBox
                ariaLabel="Animation delay"
                value={s.appear.delay}
                onChange={(delay) => set({ appear: { ...s.appear, delay: delay ?? 0 } })}
              />
            </Row>
          </div>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Skipped for anyone who has asked their device to reduce motion.
        </p>
      </Group>

      <Group title="Position &amp; visibility">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={s.position.sticky}
            onCheckedChange={(checked) =>
              set({ position: { ...s.position, sticky: checked === true } })
            }
          />
          Stick to the top when scrolling past
        </label>

        {s.position.sticky ? (
          <Row label="Sticks at (px from top)">
            <NumberBox
              ariaLabel="Sticky offset"
              value={s.position.top}
              onChange={(top) => set({ position: { ...s.position, top: top ?? 0 } })}
            />
          </Row>
        ) : null}

        <Row label="Stacking order">
          <NumberBox
            ariaLabel="Z index"
            value={s.position.zIndex || ""}
            placeholder="0"
            onChange={(zIndex) => set({ position: { ...s.position, zIndex: zIndex ?? 0 } })}
          />
        </Row>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Hide on</Label>
          <div className="flex flex-wrap gap-3">
            {DEVICES.map((option) => (
              <label key={option} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={s.hideOn.includes(option)}
                  onCheckedChange={(checked) =>
                    set({
                      hideOn:
                        checked === true
                          ? [...new Set([...s.hideOn, option])]
                          : s.hideOn.filter((entry) => entry !== option),
                    })
                  }
                />
                {DEVICE_LABELS[option]}
              </label>
            ))}
          </div>
        </div>
      </Group>
    </div>
  )
}
