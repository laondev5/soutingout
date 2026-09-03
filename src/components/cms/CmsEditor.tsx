"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import {
  BedDouble,
  Heading,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  Columns2,
  Hash,
  Images,
  Landmark,
  ListOrdered,
  Map,
  Megaphone,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Quote,
  Sparkles,
  SquareStack,
  Table,
  Timer,
  MessageCircleQuestion,
  Minus,
  MousePointerClick,
  MoveVertical,
  RotateCcw,
  Rows3,
  Save,
  Smartphone,
  Tablet,
  Type,
  Upload,
  Video,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PropertyPanel } from "@/components/cms/PropertyPanel"
import { StylePanel } from "@/components/cms/StylePanel"
import {
  DragPreview,
  SectionCanvas,
  blockLabel,
  type Selection,
} from "@/components/cms/SectionCanvas"
import type { PricingRow } from "@/components/cms/BlockRenderer"
import {
  BLOCK_SPECS,
  BLOCK_TYPES,
  newBlock,
  newSection,
  type Block,
  type BlockType,
  type Section,
} from "@/lib/cms-blocks"
import {
  DEVICES,
  DEVICE_LABELS,
  DEVICE_WIDTHS,
  defaultElementStyle,
  normalizeElementStyle,
  type Device,
  type ElementStyle,
} from "@/lib/cms-style"
import { cn } from "@/lib/utils"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Heading,
  Type,
  List,
  Info,
  Image: ImageIcon,
  MousePointerClick,
  LayoutGrid,
  BedDouble,
  Video,
  MessageCircleQuestion,
  Minus,
  MoveVertical,
  Megaphone,
  Columns2,
  SquareStack,
  Hash,
  Quote,
  Sparkles,
  Images,
  Timer,
  Landmark,
  ListOrdered,
  Table,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Map,
}

const DEVICE_ICONS: Record<Device, React.ComponentType<{ className?: string }>> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
}

export type EditorTarget = {
  /** Built-in slot inside an existing page, or a whole custom page. */
  kind: "slot" | "page"
  id: string
  name: string
  description?: string
  onDark?: boolean
}

export type SaveHandlers = {
  saveDraft: (sections: Section[]) => Promise<{ ok: boolean; error?: string }>
  publish: (sections: Section[]) => Promise<{ ok: boolean; error?: string }>
  discard?: () => Promise<{ ok: boolean; error?: string }>
  reset?: () => Promise<{ ok: boolean; error?: string; sections?: Section[] }>
}

/** Splits `sec:abc` / `blk:abc` / `drop:abc` back into its parts. */
function parseDragId(id: string) {
  const [kind, ...rest] = id.split(":")
  return { kind, id: rest.join(":") }
}

export function CmsEditor({
  target,
  initialSections,
  hasDraft,
  publishedAt,
  pricing,
  handlers,
}: {
  target: EditorTarget
  initialSections: Section[]
  hasDraft: boolean
  publishedAt: string | null
  pricing: PricingRow[]
  handlers: SaveHandlers
}) {
  const [sections, setSections] = useState<Section[]>(
    initialSections.length > 0 ? initialSections : [newSection("Section 1")]
  )
  const [selection, setSelection] = useState<Selection>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>("desktop")
  const [tab, setTab] = useState<"content" | "style">("content")
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [draft, setDraft] = useState(hasDraft)
  const [pending, startTransition] = useTransition()

  const sensors = useSensors(
    // A small activation distance means a click still selects rather than
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const mutate = useCallback((next: Section[]) => {
    setSections(next)
    setDirty(true)
  }, [])

  // ── Section operations ─────────────────────────────────────────────

  function addSection() {
    const section = newSection(`Section ${sections.length + 1}`)
    mutate([...sections, section])
    setSelection({ kind: "section", sectionId: section.id })
    setTab("style")
  }

  function removeSection(sectionId: string) {
    if (sections.length === 1) {
      toast.error("A page needs at least one section.")
      return
    }
    mutate(sections.filter((section) => section.id !== sectionId))
    setSelection(null)
  }

  function duplicateSection(sectionId: string) {
    const index = sections.findIndex((section) => section.id === sectionId)
    if (index === -1) return

    const source = sections[index]
    const copy: Section = {
      ...structuredClone(source),
      id: newSection().id,
      name: `${source.name} copy`,
      // Fresh ids, or the copy's widgets would share the original's CSS class.
      blocks: source.blocks.map((block) => ({ ...structuredClone(block), id: newBlock(block.type).id })),
    }

    const next = [...sections]
    next.splice(index + 1, 0, copy)
    mutate(next)
    setSelection({ kind: "section", sectionId: copy.id })
  }

  function toggleSection(sectionId: string) {
    mutate(
      sections.map((section) =>
        section.id === sectionId ? { ...section, visible: section.visible === false } : section
      )
    )
  }

  function patchSection(sectionId: string, patch: Partial<Section>) {
    mutate(
      sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section))
    )
  }

  // ── Block operations ───────────────────────────────────────────────

  function targetSectionId() {
    if (selection?.kind === "section") return selection.sectionId
    if (selection?.kind === "block") return selection.sectionId
    return sections[sections.length - 1]?.id
  }

  function addBlock(type: BlockType, sectionId = targetSectionId()) {
    if (!sectionId) return

    const block = newBlock(type)
    mutate(
      sections.map((section) =>
        section.id === sectionId ? { ...section, blocks: [...section.blocks, block] } : section
      )
    )
    setSelection({ kind: "block", sectionId, blockId: block.id })
    setTab("content")
  }

  function patchBlock(sectionId: string, blockId: string, patch: Partial<Block>) {
    mutate(
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              blocks: section.blocks.map((block) =>
                block.id === blockId ? { ...block, ...patch } : block
              ),
            }
          : section
      )
    )
  }

  function removeBlock(sectionId: string, blockId: string) {
    mutate(
      sections.map((section) =>
        section.id === sectionId
          ? { ...section, blocks: section.blocks.filter((block) => block.id !== blockId) }
          : section
      )
    )
    setSelection({ kind: "section", sectionId })
  }

  function duplicateBlock(sectionId: string, blockId: string) {
    const section = sections.find((entry) => entry.id === sectionId)
    if (!section) return

    const index = section.blocks.findIndex((block) => block.id === blockId)
    if (index === -1) return

    const copy = {
      ...structuredClone(section.blocks[index]),
      id: newBlock(section.blocks[index].type).id,
    }
    const blocks = [...section.blocks]
    blocks.splice(index + 1, 0, copy)

    patchSection(sectionId, { blocks })
    setSelection({ kind: "block", sectionId, blockId: copy.id })
  }

  function toggleBlock(sectionId: string, blockId: string) {
    const section = sections.find((entry) => entry.id === sectionId)
    const block = section?.blocks.find((entry) => entry.id === blockId)
    if (!block) return
    patchBlock(sectionId, blockId, { visible: block.visible === false })
  }

  // ── Dragging ───────────────────────────────────────────────────────

  function findBlock(blockId: string) {
    for (const section of sections) {
      const block = section.blocks.find((entry) => entry.id === blockId)
      if (block) return { section, block }
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id))
  }

  /**
   * Moving a widget between sections has to happen while the pointer is still
   * down — dnd-kit measures the drop target from where the item currently
   * lives, so waiting until the drop would leave it in the old list.
   */
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const from = parseDragId(String(active.id))
    if (from.kind !== "blk") return

    const to = parseDragId(String(over.id))

    const source = findBlock(from.id)
    if (!source) return

    const targetSection =
      to.kind === "drop"
        ? sections.find((section) => section.id === to.id)
        : to.kind === "blk"
          ? findBlock(to.id)?.section
          : undefined

    if (!targetSection || targetSection.id === source.section.id) return

    const remaining = source.section.blocks.filter((block) => block.id !== from.id)
    const insertAt =
      to.kind === "blk"
        ? Math.max(0, targetSection.blocks.findIndex((block) => block.id === to.id))
        : targetSection.blocks.length

    const inserted = [...targetSection.blocks]
    inserted.splice(insertAt, 0, source.block)

    mutate(
      sections.map((section) => {
        if (section.id === source.section.id) return { ...section, blocks: remaining }
        if (section.id === targetSection.id) return { ...section, blocks: inserted }
        return section
      })
    )

    setSelection({ kind: "block", sectionId: targetSection.id, blockId: from.id })
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null)

    const { active, over } = event
    if (!over) return

    const from = parseDragId(String(active.id))
    const to = parseDragId(String(over.id))

    if (from.kind === "sec" && to.kind === "sec" && from.id !== to.id) {
      const start = sections.findIndex((section) => section.id === from.id)
      const end = sections.findIndex((section) => section.id === to.id)
      if (start !== -1 && end !== -1) mutate(arrayMove(sections, start, end))
      return
    }

    if (from.kind === "blk" && to.kind === "blk" && from.id !== to.id) {
      const source = findBlock(from.id)
      const destination = findBlock(to.id)
      if (!source || !destination || source.section.id !== destination.section.id) return

      const start = source.section.blocks.findIndex((block) => block.id === from.id)
      const end = source.section.blocks.findIndex((block) => block.id === to.id)
      if (start === -1 || end === -1) return

      patchSection(source.section.id, {
        blocks: arrayMove(source.section.blocks, start, end),
      })
    }
  }

  // ── Saving ─────────────────────────────────────────────────────────

  function save() {
    startTransition(async () => {
      const result = await handlers.saveDraft(sections)
      if (!result.ok) {
        toast.error(result.error ?? "That could not be saved.")
        return
      }
      setDirty(false)
      setDraft(true)
      toast.success("Draft saved. The live page is unchanged until you publish.")
    })
  }

  function publish() {
    startTransition(async () => {
      const result = await handlers.publish(sections)
      if (!result.ok) {
        toast.error(result.error ?? "That could not be published.")
        return
      }
      setDirty(false)
      setDraft(false)
      toast.success("Published.")
    })
  }

  function discard() {
    if (!handlers.discard) return
    startTransition(async () => {
      const result = await handlers.discard!()
      if (!result.ok) {
        toast.error(result.error ?? "That could not be discarded.")
        return
      }
      toast.success("Draft discarded. Reload to see what is live.")
      setDraft(false)
      setDirty(false)
    })
  }

  function reset() {
    if (!handlers.reset) return
    startTransition(async () => {
      const result = await handlers.reset!()
      if (!result.ok) {
        toast.error(result.error ?? "That could not be reset.")
        return
      }
      if (result.sections) {
        setSections(result.sections)
        setSelection(null)
      }
      setDirty(false)
      setDraft(false)
      toast.success("Reset to the original wording.")
    })
  }

  // ── Inspector target ───────────────────────────────────────────────

  const selectedSection =
    selection ? sections.find((section) => section.id === selection.sectionId) ?? null : null

  const selectedBlock =
    selection?.kind === "block" && selectedSection
      ? selectedSection.blocks.find((block) => block.id === selection.blockId) ?? null
      : null

  const inspectorStyle: ElementStyle = normalizeElementStyle(
    (selectedBlock ?? selectedSection)?.style ?? defaultElementStyle()
  )

  function setStyle(next: ElementStyle) {
    if (!selection) return
    if (selectedBlock) {
      patchBlock(selection.sectionId, selectedBlock.id, { style: next })
    } else {
      patchSection(selection.sectionId, { style: next })
    }
  }

  const palette = useMemo(() => BLOCK_TYPES.map((type) => BLOCK_SPECS[type]), [])
  const canvasWidth = DEVICE_WIDTHS[device]

  // The artboard is always its real width — a 1280px preview squeezed into a
  // 900px column would trip the mobile container queries and lie about the
  // layout. So it is rendered full size and zoomed down to fit.
  //
  // `zoom` rather than `transform: scale()`: zoom reflows, so the surrounding
  // page gets the right height on its own and the artboard's own coordinate
  // system stays 1280px wide, which is exactly what the container queries
  // need to keep reading as desktop.
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setScale(width > 0 ? Math.min(1, width / canvasWidth) : 1)
    })

    observer.observe(frame)
    return () => observer.disconnect()
  }, [canvasWidth])

  const showInspector = Boolean(selection && selectedSection)

  return (
    <div className="space-y-3">
      {target.description ? (
        <p className="text-xs text-muted-foreground">{target.description}</p>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <div className="flex items-center gap-0.5" role="group" aria-label="Preview size">
          {DEVICES.map((option) => {
            const Icon = DEVICE_ICONS[option]
            return (
              <button
                key={option}
                type="button"
                onClick={() => setDevice(option)}
                aria-pressed={device === option}
                title={`${DEVICE_LABELS[option]} — ${DEVICE_WIDTHS[option]}px`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  device === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                <span className="hidden lg:inline">{DEVICE_LABELS[option]}</span>
              </button>
            )
          })}
        </div>

        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
          {canvasWidth}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        </span>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Button variant="outline" size="sm" onClick={addSection}>
          <Rows3 className="size-4" /> Add section
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {draft ? <Badge variant="secondary">Draft</Badge> : null}
          {dirty ? <Badge variant="outline">Unsaved</Badge> : null}

          {draft && handlers.discard ? (
            <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
              Discard
            </Button>
          ) : null}
          {handlers.reset ? (
            <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
              <RotateCcw className="size-4" />
              <span className="hidden lg:inline">Reset</span>
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={save} disabled={pending || !dirty}>
            <Save className="size-4" /> Save draft
          </Button>
          <Button size="sm" onClick={publish} disabled={pending}>
            <Upload className="size-4" /> Publish
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid items-start gap-3",
          paletteOpen
            ? showInspector
              ? "lg:grid-cols-[200px_1fr] xl:grid-cols-[200px_1fr_330px]"
              : "lg:grid-cols-[200px_1fr]"
            : showInspector
              ? "lg:grid-cols-[48px_1fr] xl:grid-cols-[48px_1fr_330px]"
              : "lg:grid-cols-[48px_1fr]"
        )}
      >
        {/* Widget rail */}
        <aside className="rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-1 border-b p-2">
            {paletteOpen ? (
              <span className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Widgets
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setPaletteOpen((open) => !open)}
              aria-expanded={paletteOpen}
              aria-label={paletteOpen ? "Collapse the widget list" : "Expand the widget list"}
              title={paletteOpen ? "Collapse" : "Widgets"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {paletteOpen ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </button>
          </div>

          <ul className={cn("p-1.5", paletteOpen ? "space-y-0.5" : "flex flex-col items-center gap-0.5")}>
            {palette.map((spec) => {
              const Icon = ICONS[spec.icon] ?? Type
              return (
                <li key={spec.type} className={paletteOpen ? "" : "w-full"}>
                  <button
                    type="button"
                    onClick={() => addBlock(spec.type)}
                    title={paletteOpen ? spec.description : `${spec.name} — ${spec.description}`}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors hover:bg-muted",
                      paletteOpen ? "px-2 py-1.5" : "justify-center p-2"
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    {paletteOpen ? <span className="truncate">{spec.name}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Canvas */}
        <div className="min-w-0">
          <div
            ref={frameRef}
            className="overflow-hidden rounded-xl border bg-muted/40 p-3"
          >
            <div
              className="mx-auto bg-background shadow-sm ring-1 ring-border"
              // `zoom` keeps the artboard's own width at `canvasWidth` for the
              // container queries while fitting it to the column.
              style={{ width: canvasWidth, zoom: scale }}
              onClick={() => setSelection(null)}
            >
              <DndContext
                id="cms-page-dnd"
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDragging(null)}
              >
                <SectionCanvas
                  sections={sections}
                  selection={selection}
                  pricing={pricing}
                  actions={{
                    onSelect: (next) => {
                      setSelection(next)
                      if (next?.kind === "section") setTab("style")
                    },
                    onRemoveSection: removeSection,
                    onDuplicateSection: duplicateSection,
                    onToggleSection: toggleSection,
                    onRemoveBlock: removeBlock,
                    onDuplicateBlock: duplicateBlock,
                    onToggleBlock: toggleBlock,
                    onAddBlockTo: (sectionId) => addBlock("paragraph", sectionId),
                  }}
                />

                <DragOverlay>
                  {dragging ? (
                    <DragPreview
                      label={
                        parseDragId(dragging).kind === "sec"
                          ? sections.find((s) => s.id === parseDragId(dragging).id)?.name ??
                            "Section"
                          : blockLabel(findBlock(parseDragId(dragging).id)?.block)
                      }
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>

          <p className="mt-2 text-center text-xs text-muted-foreground">
            {publishedAt ? `Last published ${new Date(publishedAt).toLocaleString()}. ` : ""}
            Showing {canvasWidth}px — what a {DEVICE_LABELS[device].toLowerCase()} gets.
          </p>
        </div>

        {/* Inspector — only takes space once there is something to inspect. */}
        {showInspector && selection && selectedSection ? (
          <aside className="min-w-0 rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-2 border-b p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedBlock
                    ? BLOCK_SPECS[selectedBlock.type].name
                    : selectedSection.name || "Section"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedBlock
                    ? BLOCK_SPECS[selectedBlock.type].description
                    : "Carries the background and the layout."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelection(null)}
                aria-label="Close inspector"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex border-b">
              {(["content", "style"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTab(option)}
                  aria-pressed={tab === option}
                  className={cn(
                    "flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors",
                    tab === option
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-3">
              {tab === "content" ? (
                selectedBlock ? (
                  <PropertyPanel
                    block={selectedBlock}
                    onChange={(props) =>
                      patchBlock(selection.sectionId, selectedBlock.id, { props })
                    }
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="section-name">Section name</Label>
                    <Input
                      id="section-name"
                      value={selectedSection.name}
                      onChange={(event) =>
                        patchSection(selectedSection.id, { name: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Only you see this — it labels the section in the editor.
                    </p>
                  </div>
                )
              ) : (
                <StylePanel
                  style={inspectorStyle}
                  device={device}
                  isSection={!selectedBlock}
                  onChange={setStyle}
                />
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
