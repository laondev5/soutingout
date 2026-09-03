import "server-only"
import { unstable_cache, updateTag } from "next/cache"
import { z } from "zod"
import { FormDefinitionModel, FormFieldModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import {
  BUILT_IN_FIELDS,
  needsOptions,
  type FieldType,
  type FormFieldConfig,
  type FormStepId,
} from "@/lib/form-fields"

const CACHE_TAG = "form-fields"

export function toFieldConfig(doc: {
  _id: unknown
  key: string
  label: string
  type: string
  step: string
  required?: boolean
  placeholder?: string
  helpText?: string
  options?: string[]
  order?: number
  isActive?: boolean
  isBuiltIn?: boolean
  isLocked?: boolean
}): FormFieldConfig {
  return {
    id: String(doc._id),
    key: doc.key,
    label: doc.label,
    type: doc.type as FieldType,
    step: doc.step as FormStepId,
    required: doc.required ?? false,
    placeholder: doc.placeholder ?? "",
    helpText: doc.helpText ?? "",
    options: doc.options ?? [],
    order: doc.order ?? 0,
    isActive: doc.isActive ?? true,
    isBuiltIn: doc.isBuiltIn ?? false,
    isLocked: doc.isLocked ?? false,
  }
}

/**
 * Put the built-in fields in the database the first time anyone looks, so the
 * form builder has rows to edit. Idempotent: an existing key is left exactly
 * as the super admin last saved it.
 */
export async function ensureBuiltInFields() {
  await connectDB()

  const form = await FormDefinitionModel.findOne({ kind: "registration" }).select("_id").lean()

  const existing = await FormFieldModel.find({ isBuiltIn: true }).select("key").lean()
  const have = new Set(existing.map((row) => row.key))
  const missing = BUILT_IN_FIELDS.filter((field) => !have.has(field.key)).map((field) => ({
    ...field,
    formId: form?._id ?? null,
  }))

  if (missing.length > 0) {
    await FormFieldModel.insertMany(missing, { ordered: false }).catch(() => {
      // A racing request may have inserted the same keys; the unique index
      // rejects the duplicates and the rest still land.
    })
  }
}

/**
 * Fields belonging to the registration form.
 *
 * Now that the app has more than one form, this must not pick up a standalone
 * form's fields. Rows written before forms had identity have `formId: null`
 * and are still the registration form's, so both are matched — `forms.ts`
 * stamps them on its first run.
 */
async function loadFields(): Promise<FormFieldConfig[]> {
  await connectDB()
  await ensureBuiltInFields()

  const form = await FormDefinitionModel.findOne({ kind: "registration" }).select("_id").lean()

  const filter = form
    ? { $or: [{ formId: form._id }, { formId: null }] }
    : { formId: null }

  const rows = await FormFieldModel.find(filter).sort({ step: 1, order: 1 }).lean()
  return rows.map(toFieldConfig)
}

/** All fields, cached; the registration page reads this on every render. */
export const getFormFields = () =>
  unstable_cache(loadFields, ["form-fields"], { revalidate: 300, tags: [CACHE_TAG] })()

/** Only what the public form should actually render. */
export async function getActiveFormFields() {
  const fields = await getFormFields()
  return fields.filter((field) => field.isActive)
}

/** Custom fields only, grouped by the step they belong to. */
export async function getCustomFieldsByStep() {
  const fields = await getActiveFormFields()
  const grouped: Record<string, FormFieldConfig[]> = {}

  for (const field of fields) {
    if (field.isBuiltIn) continue
    grouped[field.step] ??= []
    grouped[field.step].push(field)
  }

  return grouped
}

export function invalidateFormFields() {
  updateTag(CACHE_TAG)
}

/**
 * Build a Zod schema for the custom fields, so answers are validated on the
 * server rather than trusted from the browser. Built-ins are excluded — they
 * are already covered by `registrationSchema`.
 */
export function customFieldsSchema(fields: FormFieldConfig[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    if (field.isBuiltIn || !field.isActive) continue

    let rule: z.ZodTypeAny

    switch (field.type) {
      case "checkbox":
        // A required single checkbox means "must be ticked".
        rule = field.required
          ? z.boolean().refine((value) => value === true, `${field.label} is required.`)
          : z.boolean().optional().default(false)
        break

      case "checkboxGroup": {
        const list = z.array(z.string()).refine(
          (values) => values.every((value) => field.options.includes(value)),
          "Choose one of the listed options."
        )
        rule = field.required ? list.min(1, `${field.label} is required.`) : list.optional().default([])
        break
      }

      case "number": {
        const numeric = z.coerce.number({ message: `${field.label} must be a number.` })
        rule = field.required ? numeric : numeric.optional()
        break
      }

      case "select":
      case "radio": {
        // An option list can be edited after answers exist, so validate
        // against the current list rather than a frozen enum.
        const choice = z
          .string()
          .refine((value) => value === "" || field.options.includes(value), "Choose one of the listed options.")
        rule = field.required ? choice.min(1, `${field.label} is required.`) : choice.optional().default("")
        break
      }

      case "email": {
        const email = z.string().email(`${field.label} must be a valid email address.`)
        rule = field.required ? email : z.union([email, z.literal("")]).optional().default("")
        break
      }

      default: {
        const text = z.string().max(2000)
        rule = field.required
          ? text.min(1, `${field.label} is required.`)
          : text.optional().default("")
      }
    }

    shape[field.key] = rule
  }

  return z.object(shape)
}

/** Reject a field definition that cannot render — e.g. a dropdown with no options. */
export function validateFieldShape(field: {
  type: FieldType
  options: string[]
}): string | null {
  if (needsOptions(field.type) && field.options.filter(Boolean).length === 0) {
    return "Add at least one option for this field type."
  }
  return null
}
