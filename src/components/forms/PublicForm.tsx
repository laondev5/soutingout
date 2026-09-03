"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { submitForm } from "@/actions/form-submit.actions"
import type { FormFieldConfig } from "@/lib/form-fields"
import { cn } from "@/lib/utils"

export type PublicStep = { id: string; name: string; description: string }

/**
 * Renders one of the super admin's own forms.
 *
 * Everything here is defined in the database, so the component knows nothing
 * about the questions beyond their type. Validation is repeated on the server
 * against the same definitions — this side only exists to stop someone
 * reaching the end of a five-step form before being told step one is empty.
 */
export function PublicForm({
  slug,
  name,
  description,
  steps,
  fields,
  submitLabel,
}: {
  slug: string
  name: string
  description: string
  steps: PublicStep[]
  fields: FormFieldConfig[]
  submitLabel: string
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(fields))
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  // A step with no questions would be a dead end, so it is skipped entirely.
  const usable = steps.filter((step) => fields.some((field) => field.step === step.id))
  const active = usable[index]
  const stepFields = fields.filter((field) => field.step === active?.id)
  const isLast = index === usable.length - 1

  function set(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  /** Required-field check for the visible step only. */
  function validateStep() {
    const found: Record<string, string> = {}

    for (const field of stepFields) {
      if (!field.required) continue

      const value = values[field.key]
      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (field.type === "checkbox" && value !== true)

      if (empty) found[field.key] = `${field.label} is required.`
    }

    setErrors(found)
    return Object.keys(found).length === 0
  }

  function next() {
    if (!validateStep()) return
    setIndex((current) => Math.min(usable.length - 1, current + 1))
  }

  function submit() {
    if (!validateStep()) return

    startTransition(async () => {
      const result = await submitForm({ slug, answers: values })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setDone(result.message)
    })
  }

  if (done) {
    return (
      <div className="rounded-xl border p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <h2 className="mt-4 text-lg font-semibold">Thank you</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {done}
        </p>
      </div>
    )
  }

  if (usable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">This form has no questions yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {usable.length > 1 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {index + 1} of {usable.length}
            </span>
            <span>{active?.name}</span>
          </div>
          <Progress value={((index + 1) / usable.length) * 100} />
        </div>
      ) : null}

      <div className="space-y-5 rounded-xl border p-5">
        {usable.length > 1 || active?.description ? (
          <div>
            <h2 className="text-base font-semibold">{active?.name}</h2>
            {active?.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
            ) : null}
          </div>
        ) : null}

        {stepFields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.key]}
            error={errors[field.key]}
            onChange={(value) => set(field.key, value)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0 || pending}
        >
          <ChevronLeft className="size-4" /> Back
        </Button>

        {isLast ? (
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        ) : (
          <Button onClick={next} disabled={pending}>
            Next <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function initialValues(fields: FormFieldConfig[]) {
  const values: Record<string, unknown> = {}

  for (const field of fields) {
    values[field.key] =
      field.type === "checkbox" ? false : field.type === "checkboxGroup" ? [] : ""
  }

  return values
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormFieldConfig
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const id = `field-${field.key}`

  const label = (
    <Label htmlFor={id}>
      {field.label}
      {field.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  )

  const help = field.helpText ? (
    <p className="text-xs text-muted-foreground">{field.helpText}</p>
  ) : null

  const message = error ? <p className="text-xs text-destructive">{error}</p> : null

  switch (field.type) {
    case "textarea":
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={id}
            rows={4}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
          {message}
        </div>
      )

    case "select":
      return (
        <div className="space-y-1.5">
          {label}
          <select
            id={id}
            value={String(value ?? "")}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              "h-9 w-full rounded-lg border bg-background px-3 text-sm",
              error && "border-destructive"
            )}
          >
            <option value="">Choose…</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {help}
          {message}
        </div>
      )

    case "radio":
      return (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </legend>
          {help}
          <div className="space-y-1.5 pt-1">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.key}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="size-4 accent-primary"
                />
                {option}
              </label>
            ))}
          </div>
          {message}
        </fieldset>
      )

    case "checkbox":
      return (
        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={value === true}
              onCheckedChange={(checked) => onChange(checked === true)}
            />
            <span>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </span>
          </label>
          {help}
          {message}
        </div>
      )

    case "checkboxGroup": {
      const selected = Array.isArray(value) ? (value as string[]) : []

      return (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </legend>
          {help}
          <div className="space-y-1.5 pt-1">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...selected, option]
                        : selected.filter((entry) => entry !== option)
                    )
                  }
                />
                {option}
              </label>
            ))}
          </div>
          {message}
        </fieldset>
      )
    }

    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            type={
              field.type === "email"
                ? "email"
                : field.type === "tel"
                  ? "tel"
                  : field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : "text"
            }
            placeholder={field.placeholder}
            value={String(value ?? "")}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
          {message}
        </div>
      )
  }
}
