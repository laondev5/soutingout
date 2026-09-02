"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { Eye, EyeOff, GripVertical, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createFormField,
  deleteFormField,
  reorderFormFields,
  setFormFieldActive,
  updateFormField,
} from "@/actions/form-builder.actions"
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FORM_STEPS,
  needsOptions,
  type FieldType,
  type FormFieldConfig,
  type FormStepId,
} from "@/lib/form-fields"
import { cn } from "@/lib/utils"

type Draft = {
  id?: string
  label: string
  type: FieldType
  step: FormStepId
  required: boolean
  placeholder: string
  helpText: string
  options: string[]
  isBuiltIn: boolean
  isLocked: boolean
  key?: string
}

function blank(step: FormStepId): Draft {
  return {
    label: "",
    type: "text",
    step,
    required: false,
    placeholder: "",
    helpText: "",
    options: [],
    isBuiltIn: false,
    isLocked: false,
  }
}

function toDraft(field: FormFieldConfig): Draft {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    step: field.step,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options,
    isBuiltIn: field.isBuiltIn,
    isLocked: field.isLocked,
  }
}

export function FormBuilder({ fields }: { fields: FormFieldConfig[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, startTransition] = useTransition()

  // Local copy so a drag reorders instantly and the server catches up.
  const [local, setLocal] = useState(fields)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function byStep(step: FormStepId) {
    return local.filter((field) => field.step === step).sort((a, b) => a.order - b.order)
  }

  function onDragEnd(step: FormStepId, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const inStep = byStep(step)
    const from = inStep.findIndex((f) => f.id === active.id)
    const to = inStep.findIndex((f) => f.id === over.id)
    if (from === -1 || to === -1) return

    const reordered = arrayMove(inStep, from, to)
    const orders = new Map(reordered.map((field, index) => [field.id, (index + 1) * 10]))

    setLocal((prev) =>
      prev.map((field) => (orders.has(field.id) ? { ...field, order: orders.get(field.id)! } : field))
    )

    startTransition(async () => {
      const result = await reorderFormFields({ step, ids: reordered.map((f) => f.id) })
      if (!result.ok) {
        toast.error(result.error)
        router.refresh()
      }
    })
  }

  function save() {
    if (!draft) return

    const payload = {
      label: draft.label,
      type: draft.type,
      step: draft.step,
      required: draft.required,
      placeholder: draft.placeholder,
      helpText: draft.helpText,
      options: draft.options,
    }

    startTransition(async () => {
      const result = draft.id
        ? await updateFormField({ ...payload, id: draft.id })
        : await createFormField(payload)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(draft.id ? "Field updated." : "Field added to the form.")
      setDraft(null)
      router.refresh()
    })
  }

  function toggle(field: FormFieldConfig) {
    startTransition(async () => {
      const result = await setFormFieldActive({ id: field.id, isActive: !field.isActive })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(field.isActive ? `${field.label} hidden.` : `${field.label} is now shown.`)
      router.refresh()
    })
  }

  function remove(field: FormFieldConfig) {
    startTransition(async () => {
      const result = await deleteFormField({ id: field.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${field.label} deleted.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Form builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add questions to the registration form, reword existing ones, and drag to reorder.
          </p>
        </div>
      </div>

      <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        Fields marked <Lock className="inline size-3" /> are wired into pricing, bed allocation and
        the Google Sheet import. You can reword them, but they cannot be removed or retyped.
      </p>

      <div className="space-y-6">
        {FORM_STEPS.map((step) => {
          const inStep = byStep(step.id)

          return (
            <section key={step.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{step.name}</h2>
                <Button size="sm" variant="outline" onClick={() => setDraft(blank(step.id))}>
                  <Plus className="size-3.5" /> Add field
                </Button>
              </div>

              {inStep.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No fields on this step.
                </p>
              ) : (
                <DndContext
                  // Explicit id: without it dnd-kit numbers its accessibility
                  // ids from a shared counter, which differs between the
                  // server render and hydration.
                  id={`form-step-${step.id}`}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={(event) => onDragEnd(step.id, event)}
                >
                  <SortableContext
                    items={inStep.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="divide-y overflow-hidden rounded-xl border">
                      {inStep.map((field) => (
                        <SortableField
                          key={field.id}
                          field={field}
                          onEdit={() => setDraft(toDraft(field))}
                          onToggle={() => toggle(field)}
                          onDelete={() => remove(field)}
                          busy={pending}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </section>
          )
        })}
      </div>

      <FieldDialog
        draft={draft}
        pending={pending}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={save}
      />
    </div>
  )
}

function SortableField({
  field,
  onEdit,
  onToggle,
  onDelete,
  busy,
}: {
  field: FormFieldConfig
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  busy: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-wrap items-center gap-2 bg-background px-2 py-2.5 sm:px-3",
        isDragging && "opacity-50",
        !field.isActive && "opacity-50"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${field.label}`}
        className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {field.label}
          {field.isLocked ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : null}
          {field.required ? <span className="text-destructive">*</span> : null}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">{field.key}</p>
      </div>

      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="hidden sm:inline-flex">
          {FIELD_TYPE_LABELS[field.type]}
        </Badge>
        {field.isBuiltIn ? <Badge variant="secondary">Built-in</Badge> : null}
        {!field.isActive ? <Badge variant="outline">Hidden</Badge> : null}

        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${field.label}`}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onToggle}
          disabled={busy || field.isLocked}
          aria-label={field.isActive ? `Hide ${field.label}` : `Show ${field.label}`}
        >
          {field.isActive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
        {!field.isBuiltIn ? (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Delete ${field.label}`}
            className="text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function FieldDialog({
  draft,
  pending,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null
  pending: boolean
  onChange: (draft: Draft) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit field" : "Add field"}</DialogTitle>
          <DialogDescription>
            {draft?.isBuiltIn
              ? "This is a built-in field. You can change the wording, but not what it collects."
              : "Answers appear on the delegate's profile and in the XLSX export."}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-label">Label</Label>
              <Input
                id="field-label"
                value={draft.label}
                onChange={(event) => onChange({ ...draft, label: event.target.value })}
                placeholder="Which church branch do you attend?"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="field-type">Type</Label>
                <select
                  id="field-type"
                  value={draft.type}
                  disabled={draft.isBuiltIn}
                  onChange={(event) =>
                    onChange({ ...draft, type: event.target.value as FieldType })
                  }
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-50"
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {FIELD_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="field-step">Step</Label>
                <select
                  id="field-step"
                  value={draft.step}
                  disabled={draft.isBuiltIn}
                  onChange={(event) =>
                    onChange({ ...draft, step: event.target.value as FormStepId })
                  }
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-50"
                >
                  {FORM_STEPS.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {needsOptions(draft.type) && (!draft.isBuiltIn || draft.key === "gender") ? (
              <div className="space-y-1.5">
                <Label htmlFor="field-options">Options</Label>
                <Textarea
                  id="field-options"
                  rows={4}
                  value={draft.options.join("\n")}
                  onChange={(event) =>
                    onChange({ ...draft, options: event.target.value.split("\n") })
                  }
                  placeholder={"One option per line\nAnother option"}
                />
                <p className="text-xs text-muted-foreground">One option per line.</p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="field-placeholder">Placeholder</Label>
              <Input
                id="field-placeholder"
                value={draft.placeholder}
                onChange={(event) => onChange({ ...draft, placeholder: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="field-help">Help text</Label>
              <Input
                id="field-help"
                value={draft.helpText}
                onChange={(event) => onChange({ ...draft, helpText: event.target.value })}
                placeholder="Shown in small print under the field."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.required}
                disabled={draft.isLocked}
                onCheckedChange={(checked) => onChange({ ...draft, required: checked === true })}
              />
              Required
              {draft.isLocked ? (
                <span className="text-xs text-muted-foreground">(always required)</span>
              ) : null}
            </label>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {draft?.id ? "Save changes" : "Add field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
