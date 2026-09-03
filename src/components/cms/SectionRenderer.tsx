import { BlockRenderer, type RenderContext } from "@/components/cms/BlockRenderer"
import { AppearWatcher } from "@/components/cms/AppearWatcher"
import {
  normalizeElementStyle,
  safeStyleId,
  sectionInnerCss,
  sectionShellCss,
  toneClass,
} from "@/lib/cms-style"
import { cn } from "@/lib/utils"
import type { Section } from "@/lib/cms-blocks"

/**
 * Renders a built page: each section paints its own background and lays out
 * the widgets inside it.
 *
 * The whole thing sits in a `cms-canvas`, which is what the per-device rules
 * measure themselves against. On the real site that wrapper is the page, so it
 * tracks the browser window; in the editor it is the phone-width preview, so
 * the same CSS produces the phone layout without faking anything.
 *
 * Deliberately not a client component: the pages this fills are public and
 * should arrive as HTML. Only the scroll-animation watcher runs on the client.
 */
export function SectionRenderer({
  sections,
  context = {},
  className,
  /** The editor supplies its own container, so it turns this one off. */
  asCanvas = true,
  /** The editor shows animated widgets in their finished state. */
  animate = true,
}: {
  sections: Section[]
  context?: RenderContext
  className?: string
  asCanvas?: boolean
  animate?: boolean
}) {
  const visible = sections.filter((section) => section.visible !== false)

  if (visible.length === 0) return null

  // Scoped to the first section's id so two renderers on one page do not fight
  // over the same animation scope.
  const scopeId = `cms-${safeStyleId(visible[0].id)}`

  const css = visible
    .map((section) => {
      const style = normalizeElementStyle(section.style)
      const id = safeStyleId(section.id)
      return sectionShellCss(`.cms-s-${id}`, style) + sectionInnerCss(`.cms-si-${id}`, style)
    })
    .join("")

  const animated = animate && visible.some((section) => hasAnimation(section))

  return (
    <div id={scopeId} className={cn(asCanvas && "cms-canvas", className)}>
      <style>{css}</style>

      {visible.map((section) => {
        const style = normalizeElementStyle(section.style)
        const id = safeStyleId(section.id)

        return (
          <div
            key={section.id}
            className={cn(`cms-s-${id}`, toneClass(style.textTone))}
            data-appear={animate && style.appear.animation !== "none" ? "out" : undefined}
          >
            <div className={`cms-si-${id}`}>
              <BlockRenderer
                blocks={section.blocks}
                animate={animate}
                context={{
                  ...context,
                  onDark: style.textTone === "light" ? true : context.onDark,
                }}
              />
            </div>
          </div>
        )
      })}

      {animated ? <AppearWatcher scopeId={scopeId} /> : null}
    </div>
  )
}

function hasAnimation(section: Section) {
  if (normalizeElementStyle(section.style).appear.animation !== "none") return true
  return section.blocks.some(
    (block) => normalizeElementStyle(block.style).appear.animation !== "none"
  )
}
