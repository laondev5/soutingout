"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  BedDouble,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  MessageCircleQuestion,
  Minus,
  MousePointerClick,
  MoveVertical,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PropertyPanel } from "@/components/cms/PropertyPanel"
import { BlockRenderer, type PricingRow } from "@/components/cms/BlockRenderer"
import { discardDraft, publishSection, resetSection, saveDraft } from "@/actions/cms.actions"
import {
  BLOCK_SPECS,
  BLOCK_TYPES,
  newBlock,
  type Block,
  type BlockType,
} from "@/lib/cms-blocks"
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
}

export type SectionOption = { slug: string; name: string; description: string; onDark?: boolean }

export function CmsEditor({
  sections,
  activeSlug,
  initialBlocks,
  hasDraft,
  publishedAt,
  pricing,
  onSelectSection,
}: {
  sections: SectionOption[]
  activeSlug: string
  initialBlocks: Block[]
  hasDraft: boolean
  publishedAt: string | null
  pricing: PricingRow[]
  onSelectSection: (slug: string) => void
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks)
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [draft, setDraft] = useState(hasDraft)
  const [pending, startTransition] = useTransition()

  // Switching sections replaces the whole document, so reset local state.
  const loadedFor = useRef(activeSlug)
  useEffect(() => {
    if (loadedFor.current !== activeSlug) {
      loadedFor.current = activeSlug
      setBlocks(initialBlocks)
      setSelectedId(initialBlocks[0]?.id ?? null)
      setDirty(false)
      setDraft(hasDraft)
    }
  }, [activeSlug, initialBlocks, hasDraft])

  const section = sections.find((s) => s.slug === activeSlug)
  const selected = blocks.find((block) => block.id === selectedId) ?? null

  const sensors = useSensors(
    // A small activation distance means a click still selects a block rather
    // than starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const mutate = useCallback((next: Block[]) => {
    setBlocks(next)
    setDirty(true)
  }, [])

  function addBlock(type: BlockType) {
    const block = newBlock(type)
    mutate([...blocks, block])
    setSelectedId(block.id)
  }

  function updateProps(id: string, props: Record<string, unknown>) {
    mutate(blocks.map((block) => (block.id === id ? { ...block, props } : block)))
  }

  function remove(id: string) {
    mutate(blocks.filter((block) => block.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function duplicate(id: string) {
    const index = blocks.findIndex((block) => block.id === id)
    if (index === -1) return

    const copy = { ...structuredClone(blocks[index]), id: newBlock(blocks[index].type).id }
    const next = [...blocks]
    next.splice(index + 1, 0, copy)
    mutate(next)
    setSelectedId(copy.id)
  }

  function toggleVisible(id: string) {
    mutate(
      blocks.map((block) => (block.id === id ? { ...block, visible: block.visible === false } : block))
    )
  }

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = blocks.findIndex((block) => block.id === active.id)
    const to = blocks.findIndex((block) => block.id === over.id)
    if (from === -1 || to === -1) return

    mutate(arrayMove(blocks, from, to))
  }

  function save() {
    startTransition(async () => {
      const result = await saveDraft({ slug: activeSlug, blocks })
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setDirty(false)
      setDraft(true)
      toast.success("Draft saved. The live page is unchanged until you publish.")
    })
  }

  function publish() {
    startTransition(async () => {
      const result = await publishSection({ slug: activeSlug, blocks })
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setDirty(false)
      setDraft(false)
      toast.success("Published. The delegate pages are updated.")
    })
  }

  function discard() {
    startTransition(async () => {
      const result = await discardDraft({ slug: activeSlug })
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setDraft(false)
      setDirty(false)
      toast.success("Draft discarded.")
      onSelectSection(activeSlug)
    })
  }

  function reset() {
    startTransition(async () => {
      const result = await resetSection({ slug: activeSlug })
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setBlocks(result.blocks)
      setSelectedId(result.blocks[0]?.id ?? null)
      setDirty(false)
      setDraft(false)
      toast.success("Reset to the original wording.")
    })
  }

  const palette = useMemo(() => BLOCK_TYPES.map((type) => BLOCK_SPECS[type]), [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Page content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag widgets onto the page, edit them on the right, then publish.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft ? <Badge variant="secondary">Unpublished draft</Badge> : null}
          {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
          <Button variant="outline" size="sm" onClick={save} disabled={pending || !dirty}>
            <Save className="size-4" /> Save draft
          </Button>
          <Button size="sm" onClick={publish} disabled={pending}>
            <Upload className="size-4" /> Publish
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <label htmlFor="cms-section" className="text-sm text-muted-foreground">
          Editing
        </label>
        <select
          id="cms-section"
          value={activeSlug}
          onChange={(event) => {
            if (dirty && !confirm("You have unsaved changes. Leave this section?")) return
            onSelectSection(event.target.value)
          }}
          className="h-9 min-w-56 flex-1 rounded-md border bg-transparent px-2 text-sm sm:flex-none"
        >
          {sections.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>

        {draft ? (
          <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
            Discard draft
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
          <RotateCcw className="size-4" /> Reset to original
        </Button>
      </div>

      {section?.description ? (
        <p className="text-xs text-muted-foreground">{section.description}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[190px_1fr_290px]">
        {/* Palette */}
        <aside className="order-1 rounded-xl border p-3">
          <h2 className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Widgets
          </h2>
          <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {palette.map((spec) => {
              const Icon = ICONS[spec.icon] ?? Type
              return (
                <li key={spec.type}>
                  <button
                    type="button"
                    onClick={() => addBlock(spec.type)}
                    title={spec.description}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{spec.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Canvas */}
        <div className="order-3 min-w-0 lg:order-2">
          <DndContext
            id="cms-canvas-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDraggingId(null)}
          >
            <Canvas
              blocks={blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemove={remove}
              onDuplicate={duplicate}
              onToggleVisible={toggleVisible}
              onDark={section?.onDark}
              pricing={pricing}
            />

            <DragOverlay>
              {draggingId ? (
                <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-lg">
                  {BLOCK_SPECS[blocks.find((b) => b.id === draggingId)?.type ?? "heading"]?.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Inspector */}
        <aside className="order-2 rounded-xl border p-4 lg:order-3">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-medium">{BLOCK_SPECS[selected.type].name}</h2>
                <p className="text-xs text-muted-foreground">
                  {BLOCK_SPECS[selected.type].description}
                </p>
              </div>
              <PropertyPanel
                block={selected}
                onChange={(props) => updateProps(selected.id, props)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick a widget on the page to edit it, or add one from the list.
            </p>
          )}
        </aside>
      </div>

      {publishedAt ? (
        <p className="text-xs text-muted-foreground">
          Last published {new Date(publishedAt).toLocaleString()}.
        </p>
      ) : null}
    </div>
  )
}

function Canvas({
  blocks,
  selectedId,
  onSelect,
  onRemove,
  onDuplicate,
  onToggleVisible,
  onDark,
  pricing,
}: {
  blocks: Block[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onToggleVisible: (id: string) => void
  onDark?: boolean
  pricing: PricingRow[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "cms-canvas" })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-72 rounded-xl border p-4 transition-colors",
        onDark && "border-emerald-900 bg-emerald-950 text-emerald-50",
        isOver && "border-primary"
      )}
    >
      {blocks.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          This section is empty. Add a widget from the list.
        </p>
      ) : (
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                selected={block.id === selectedId}
                onSelect={() => onSelect(block.id)}
                onRemove={() => onRemove(block.id)}
                onDuplicate={() => onDuplicate(block.id)}
                onToggleVisible={() => onToggleVisible(block.id)}
                onDark={onDark}
                pricing={pricing}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  )
}

function SortableBlock({
  block,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
  onToggleVisible,
  onDark,
  pricing,
}: {
  block: Block
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  onToggleVisible: () => void
  onDark?: boolean
  pricing: PricingRow[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })

  const hidden = block.visible === false

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={cn(
        "group relative rounded-lg border-2 border-dashed border-transparent p-2 transition-colors",
        selected ? "border-primary" : "hover:border-border",
        isDragging && "opacity-50",
        hidden && "opacity-40"
      )}
    >
      {/* Toolbar mirrors Elementor: grab handle left, actions right. */}
      <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm group-hover:flex data-[selected=true]:flex"
        data-selected={selected}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
          aria-label={hidden ? "Show block" : "Hide block"}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          aria-label="Duplicate block"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          aria-label="Delete block"
          className="rounded p-1 text-destructive hover:bg-muted"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* The canvas shows the real renderer, so what you see is what ships. */}
      <div className="pointer-events-none">
        <BlockRenderer blocks={[{ ...block, visible: true }]} context={{ onDark, pricing }} />
      </div>
    </div>
  )
}
