"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react"
import { BlockRenderer, type PricingRow } from "@/components/cms/BlockRenderer"
import {
  normalizeElementStyle,
  safeStyleId,
  sectionInnerCss,
  sectionShellCss,
  toneClass,
} from "@/lib/cms-style"
import { BLOCK_SPECS, type Block, type Section } from "@/lib/cms-blocks"
import { cn } from "@/lib/utils"

export type Selection =
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string }
  | null

type Actions = {
  onSelect: (selection: Selection) => void
  onRemoveSection: (sectionId: string) => void
  onDuplicateSection: (sectionId: string) => void
  onToggleSection: (sectionId: string) => void
  onRemoveBlock: (sectionId: string, blockId: string) => void
  onDuplicateBlock: (sectionId: string, blockId: string) => void
  onToggleBlock: (sectionId: string, blockId: string) => void
  onAddBlockTo: (sectionId: string) => void
}

/** dnd-kit needs one id space; the prefix says what kind of thing was grabbed. */
export const sectionDragId = (id: string) => `sec:${id}`
export const blockDragId = (id: string) => `blk:${id}`
export const dropZoneId = (id: string) => `drop:${id}`

export function SectionCanvas({
  sections,
  selection,
  pricing,
  actions,
}: {
  sections: Section[]
  selection: Selection
  pricing: PricingRow[]
  actions: Actions
}) {
  // The real renderer's CSS, so the canvas is the page rather than an
  // approximation of it.
  const css = sections
    .map((section) => {
      const style = normalizeElementStyle(section.style)
      const id = safeStyleId(section.id)
      return sectionShellCss(`.cms-s-${id}`, style) + sectionInnerCss(`.cms-si-${id}`, style)
    })
    .join("")

  return (
    <div className="cms-canvas w-full">
      <style>{css}</style>

      <SortableContext
        items={sections.map((section) => sectionDragId(section.id))}
        strategy={verticalListSortingStrategy}
      >
        {sections.map((section, index) => (
          <SortableSection
            key={section.id}
            section={section}
            index={index}
            selection={selection}
            pricing={pricing}
            actions={actions}
          />
        ))}
      </SortableContext>
    </div>
  )
}

function SortableSection({
  section,
  index,
  selection,
  pricing,
  actions,
}: {
  section: Section
  index: number
  selection: Selection
  pricing: PricingRow[]
  actions: Actions
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionDragId(section.id),
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropZoneId(section.id) })

  const style = normalizeElementStyle(section.style)
  const id = safeStyleId(section.id)
  const selected = selection?.kind === "section" && selection.sectionId === section.id
  const hidden = section.visible === false

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/section relative mb-2 rounded-lg border-2 transition-colors",
        selected ? "border-primary" : "border-dashed border-border hover:border-primary/50",
        isDragging && "opacity-50",
        hidden && "opacity-40"
      )}
      onClick={(event) => {
        event.stopPropagation()
        actions.onSelect({ kind: "section", sectionId: section.id })
      }}
    >
      {/* Always visible, not on hover: without it a section with no
          background is indistinguishable from the page around it, and you
          cannot tell where one ends and the next begins. */}
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md border-b px-1.5 py-1 text-xs",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag section ${section.name}`}
          className="cursor-grab rounded p-0.5 hover:bg-black/10 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        <span className="min-w-0 flex-1 truncate font-medium">
          {section.name || `Section ${index + 1}`}
        </span>

        <span className="hidden shrink-0 tabular-nums opacity-70 sm:inline">
          {section.blocks.length} widget{section.blocks.length === 1 ? "" : "s"}
        </span>

        <IconButton label="Add a widget here" onClick={() => actions.onAddBlockTo(section.id)}>
          <Plus className="size-3.5" />
        </IconButton>
        <IconButton
          label={hidden ? "Show section" : "Hide section"}
          onClick={() => actions.onToggleSection(section.id)}
        >
          {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </IconButton>
        <IconButton label="Duplicate section" onClick={() => actions.onDuplicateSection(section.id)}>
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton
          label="Delete section"
          destructive={!selected}
          onClick={() => actions.onRemoveSection(section.id)}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>

      <div className={cn(`cms-s-${id}`, toneClass(style.textTone), "min-h-16")}>
        <div
          ref={setDropRef}
          className={cn(`cms-si-${id}`, isOver && "rounded outline-2 outline-primary/60")}
        >
          {section.blocks.length === 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                actions.onAddBlockTo(section.id)
              }}
              className="w-full rounded-lg border-2 border-dashed py-10 text-center text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              Empty section — add a widget
            </button>
          ) : (
            <SortableContext
              items={section.blocks.map((block) => blockDragId(block.id))}
              strategy={verticalListSortingStrategy}
            >
              {section.blocks.map((block) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  sectionId={section.id}
                  selected={
                    selection?.kind === "block" && selection.blockId === block.id
                  }
                  onDark={style.textTone === "light"}
                  pricing={pricing}
                  actions={actions}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </div>
    </div>
  )
}

function SortableBlock({
  block,
  sectionId,
  selected,
  onDark,
  pricing,
  actions,
}: {
  block: Block
  sectionId: string
  selected: boolean
  onDark: boolean
  pricing: PricingRow[]
  actions: Actions
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockDragId(block.id),
    data: { sectionId },
  })

  const hidden = block.visible === false

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(event) => {
        event.stopPropagation()
        actions.onSelect({ kind: "block", sectionId, blockId: block.id })
      }}
      className={cn(
        "group/block relative min-w-0 rounded border-2 border-dashed border-transparent",
        selected ? "border-primary" : "hover:border-border",
        isDragging && "opacity-50",
        hidden && "opacity-40"
      )}
    >
      <div
        className="absolute -top-3 right-1 z-10 hidden items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm group-hover/block:flex data-[selected=true]:flex"
        data-selected={selected}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag widget"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <IconButton
          label={hidden ? "Show widget" : "Hide widget"}
          onClick={() => actions.onToggleBlock(sectionId, block.id)}
        >
          {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </IconButton>
        <IconButton
          label="Duplicate widget"
          onClick={() => actions.onDuplicateBlock(sectionId, block.id)}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton
          label="Delete widget"
          destructive
          onClick={() => actions.onRemoveBlock(sectionId, block.id)}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>

      {/* The canvas shows the real renderer, so what you see is what ships.
          Animations are forced to their finished state — an editor that fades
          its own content in on every keystroke is unusable. */}
      <div className="pointer-events-none">
        <BlockRenderer
          blocks={[{ ...block, visible: true }]}
          context={{ onDark, pricing }}
          animate={false}
        />
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        "rounded p-1 hover:bg-muted",
        destructive ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

/** What the drag overlay shows while something is in the air. */
export function DragPreview({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-lg">{label}</div>
  )
}

export function blockLabel(block: Block | undefined) {
  return block ? BLOCK_SPECS[block.type]?.name ?? "Widget" : "Widget"
}
