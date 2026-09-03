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
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
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
  createFormStep,
  deleteFormStep,
  reorderFormSteps,
  updateFormStep,
} from "@/actions/forms.actions"
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  needsOptions,
  type FieldType,
  type FormFieldConfig,
} from "@/lib/form-fields"
import type { FormStep, FormSummary } from "@/lib/forms"
import { cn } from "@/lib/utils"

type Draft = {
  id?: string
  label: string
  type: FieldType
  step: string
  required: boolean
  placeholder: string
  helpText: string
  options: string[]
  isBuiltIn: boolean
  isLocked: boolean
  key?: string
}

function blank(step: string): Draft {
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

type StepDraft = { id?: string; name: string; description: string }

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

export function FormBuilder({
  form,
  fields,
}: {
  form: FormSummary
  fields: FormFieldConfig[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [stepDraft, setStepDraft] = useState<StepDraft | null>(null)
  const [removingStep, setRemovingStep] = useState<FormStep | null>(null)
  const [moveTo, setMoveTo] = useState("")
  const [pending, startTransition] = useTransition()

  // Local copy so a drag reorders instantly and the server catches up.
  const [local, setLocal] = useState(fields)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function byStep(step: string) {
    return local.filter((field) => field.step === step).sort((a, b) => a.order - b.order)
  }

  function onDragEnd(step: string, event: DragEndEvent) {
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
      const result = await reorderFormFields({
        formId: form.id,
        step,
        ids: reordered.map((f) => f.id),
      })
      if (!result.ok) {
        toast.error(result.error)
        router.refresh()
      }
    })
  }


  function saveStep() {
    if (!stepDraft) return

    startTransition(async () => {
      const result = stepDraft.id
        ? await updateFormStep({
            formId: form.id,
            stepId: stepDraft.id,
            name: stepDraft.name,
            description: stepDraft.description,
          })
        : await createFormStep({
            formId: form.id,
            name: stepDraft.name,
            description: stepDraft.description,
          })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(stepDraft.id ? "Step updated." : "Step added.")
      setStepDraft(null)
      router.refresh()
    })
  }

  function confirmRemoveStep() {
    if (!removingStep) return

    startTransition(async () => {
      const result = await deleteFormStep({
        formId: form.id,
        stepId: removingStep.id,
        moveFieldsTo: moveTo || undefined,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(
        result.moved > 0
          ? `Step removed. ${result.moved} question${result.moved === 1 ? "" : "s"} moved.`
          : "Step removed."
      )
      setRemovingStep(null)
      setMoveTo("")
      router.refresh()
    })
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    const order = form.steps.map((step) => step.id)
    const from = order.indexOf(stepId)
    const to = from + direction
    if (from === -1 || to < 0 || to >= order.length) return

    const next = arrayMove(order, from, to)

    startTransition(async () => {
      const result = await reorderFormSteps({ formId: form.id, stepIds: next })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function save() {
    if (!draft) return

    const payload = {
      formId: form.id,
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {form.kind === "registration"
            ? "Questions on the public registration stepper."
            : `Questions on this form. Answers go to the ${form.collectionName} collection.`}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setStepDraft({ name: "", description: "" })}
        >
          <Plus className="size-3.5" /> Add step
        </Button>
      </div>

      {form.kind === "registration" ? (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
          Fields marked <Lock className="inline size-3" /> are wired into pricing, bed allocation
          and the Google Sheet import. You can reword them, but they cannot be removed or retyped.
          The steps they sit on cannot be removed either.
        </p>
      ) : null}

      <div className="space-y-6">
        {form.steps.map((step, stepIndex) => {
          const inStep = byStep(step.id)

          return (
            <section key={step.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {stepIndex + 1}
                  </span>
                  <h2 className="truncate text-sm font-medium">{step.name}</h2>
                  {step.isBuiltIn ? <Lock className="size-3 text-muted-foreground" /> : null}
                  {step.description ? (
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      — {step.description}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${step.name} up`}
                    disabled={stepIndex === 0 || pending}
                    onClick={() => moveStep(step.id, -1)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${step.name} down`}
                    disabled={stepIndex === form.steps.length - 1 || pending}
                    onClick={() => moveStep(step.id, 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setStepDraft({
                        id: step.id,
                        name: step.name,
                        description: step.description,
                      })
                    }
                  >
                    <Pencil className="size-3.5" /> Rename
                  </Button>
                  {!step.isBuiltIn ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setRemovingStep(step)
                        setMoveTo("")
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setDraft(blank(step.id))}>
                    <Plus className="size-3.5" /> Add field
                  </Button>
                </div>
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
        steps={form.steps}
        pending={pending}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={save}
      />

      <Dialog open={stepDraft !== null} onOpenChange={(open) => !open && setStepDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stepDraft?.id ? "Rename step" : "New step"}</DialogTitle>
            <DialogDescription>
              A step is one screen of the form. Questions are filed under whichever step you put
              them on.
            </DialogDescription>
          </DialogHeader>

          {stepDraft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="step-name">Name</Label>
                <Input
                  id="step-name"
                  value={stepDraft.name}
                  placeholder="e.g. About you"
                  onChange={(event) => setStepDraft({ ...stepDraft, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="step-description">Description</Label>
                <Textarea
                  id="step-description"
                  rows={2}
                  placeholder="Shown under the step name. Optional."
                  value={stepDraft.description}
                  onChange={(event) =>
                    setStepDraft({ ...stepDraft, description: event.target.value })
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setStepDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveStep} disabled={pending || !stepDraft?.name.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {stepDraft?.id ? "Save" : "Add step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removingStep !== null} onOpenChange={(open) => !open && setRemovingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removingStep?.name}?</DialogTitle>
            <DialogDescription>
              {removingStep && byStep(removingStep.id).length > 0
                ? "This step still has questions. Choose where they should go — deleting a question would lose the answers people already gave it."
                : "This step has no questions on it."}
            </DialogDescription>
          </DialogHeader>

          {removingStep && byStep(removingStep.id).length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="move-to">Move its questions to</Label>
              <select
                id="move-to"
                value={moveTo}
                onChange={(event) => setMoveTo(event.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">Choose…</option>
                {form.steps
                  .filter((step) => step.id !== removingStep.id)
                  .map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemovingStep(null)} disabled={pending}>
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveStep}
              disabled={
                pending ||
                (removingStep !== null && byStep(removingStep.id).length > 0 && !moveTo)
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  steps,
  pending,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null
  steps: FormStep[]
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
                    onChange({ ...draft, step: event.target.value })
                  }
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-50"
                >
                  {steps.map((step) => (
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
