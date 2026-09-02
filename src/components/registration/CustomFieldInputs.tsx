"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/registration/Field"
import type { FormFieldConfig } from "@/lib/form-fields"

export type CustomAnswers = Record<string, unknown>

/**
 * Renders the super-admin-defined questions for one step.
 *
 * These are kept outside react-hook-form: the field list is only known at
 * runtime, so the answers live in a plain state object on the stepper and are
 * validated on the server against the same definitions.
 */
export function CustomFieldInputs({
  fields,
  values,
  errors,
  onChange,
}: {
  fields: FormFieldConfig[]
  values: CustomAnswers
  errors: Record<string, string>
  onChange: (key: string, value: unknown) => void
}) {
  if (fields.length === 0) return null

  return (
    <>
      {fields.map((field) => (
        <CustomField
          key={field.id}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </>
  )
}

function CustomField({
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
  const id = `custom-${field.key}`
  const label = field.label

  switch (field.type) {
    case "textarea":
      return (
        <Field label={label} htmlFor={id} required={field.required} error={error} hint={field.helpText}>
          <Textarea
            id={id}
            rows={4}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )

    case "select":
      return (
        <Field label={label} htmlFor={id} required={field.required} error={error} hint={field.helpText}>
          <select
            id={id}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">{field.placeholder || "Choose one"}</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      )

    case "radio":
      return (
        <Field label={label} required={field.required} error={error} hint={field.helpText}>
          <div className="space-y-2">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name={id}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="size-4 accent-primary"
                />
                {option}
              </label>
            ))}
          </div>
        </Field>
      )

    case "checkbox":
      return (
        <Field error={error} hint={field.helpText}>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={value === true}
              onCheckedChange={(checked) => onChange(checked === true)}
            />
            <span>{label}</span>
          </label>
        </Field>
      )

    case "checkboxGroup": {
      const selected = new Set(Array.isArray(value) ? (value as string[]) : [])

      return (
        <Field label={label} required={field.required} error={error} hint={field.helpText}>
          <div className="space-y-2">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={selected.has(option)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected)
                    if (checked === true) next.add(option)
                    else next.delete(option)
                    onChange([...next])
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        </Field>
      )
    }

    case "number":
    case "email":
    case "tel":
    case "date":
    case "text":
    default:
      return (
        <Field label={label} htmlFor={id} required={field.required} error={error} hint={field.helpText}>
          <Input
            id={id}
            type={field.type === "text" ? "text" : field.type}
            inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : undefined}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )
  }
}
