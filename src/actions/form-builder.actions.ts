"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { z } from "zod"
import { FormDefinitionModel, FormFieldModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { invalidateFormFields, validateFieldShape } from "@/lib/form-config"
import { invalidateForms } from "@/lib/forms"
import { logActivity } from "@/lib/activity-log"
import { FIELD_TYPES, RESERVED_KEYS, keyFromLabel, type FieldType } from "@/lib/form-fields"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const fieldSchema = z.object({
  formId: z.string().min(1, "Unknown form."),
  label: z.string().trim().min(1, "Give the field a label.").max(160),
  type: z.enum(FIELD_TYPES),
  step: z.string().trim().min(1, "Unknown step.").max(80),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(160).default(""),
  helpText: z.string().trim().max(400).default(""),
  options: z.array(z.string().trim().max(160)).max(40).default([]),
})

function cleanOptions(options: string[]) {
  return [...new Set(options.map((option) => option.trim()).filter(Boolean))]
}

function refreshPublic(slug?: string) {
  invalidateFormFields()
  invalidateForms()
  revalidatePath("/register")
  revalidatePath("/dashboard/form-builder")
  if (slug) revalidatePath(`/forms/${slug}`)
}

/**
 * The form a field is being filed under, and the step within it.
 *
 * Step ids are per-form now, so "does this step exist" can only be answered by
 * reading the form — a stale browser tab must not be able to file a question
 * under a step that was deleted.
 */
async function resolveTarget(formId: string, stepId: string) {
  if (!mongoose.Types.ObjectId.isValid(formId)) return null

  const form = await FormDefinitionModel.findById(formId).select("slug steps kind")
  if (!form) return null

  const step = form.steps.find((entry) => entry.id === stepId)
  if (!step) return null

  return { form, step }
}

export async function createFormField(
  input: z.input<typeof fieldSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSuperAdmin()

  const parsed = fieldSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the field details." }
  }

  const values = { ...parsed.data, options: cleanOptions(parsed.data.options) }

  const shapeError = validateFieldShape({ type: values.type as FieldType, options: values.options })
  if (shapeError) return { ok: false, error: shapeError }

  await connectDB()

  const target = await resolveTarget(values.formId, values.step)
  if (!target) return { ok: false, error: "That form or step could not be found." }

  // The key is derived from the label, then made unique within this form. It
  // is what the answer is stored under, so on the registration form it must
  // never collide with a real Delegate column.
  const base = keyFromLabel(values.label)
  let key =
    target.form.kind === "registration" && RESERVED_KEYS.has(base) ? `custom_${base}` : base
  let suffix = 2

  while (await FormFieldModel.exists({ formId: target.form._id, key })) {
    key = `${base}_${suffix}`
    suffix += 1
    if (suffix > 50) return { ok: false, error: "Could not find a free key for that label." }
  }

  const last = await FormFieldModel.findOne({ formId: target.form._id, step: values.step })
    .sort({ order: -1 })
    .select("order")

  const created = await FormFieldModel.create({
    ...values,
    formId: target.form._id,
    key,
    order: (last?.order ?? 0) + 10,
    isActive: true,
    isBuiltIn: false,
    isLocked: false,
  })

  await logActivity({
    actorUserId: user.id,
    action: "form.field_created",
    entityType: "form_field",
    entityId: String(created._id),
    details: { key, label: values.label, step: values.step, type: values.type },
  })

  refreshPublic(target.form.slug)
  return { ok: true, id: String(created._id) }
}

/**
 * Edit a field. A built-in's wording is editable, but its key, type and step
 * are not — pricing, the Sheet import and the delegate record all depend on
 * those staying put.
 */
export async function updateFormField(
  input: z.input<typeof fieldSchema> & { id: string }
): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That field could not be found." }
  }

  const parsed = fieldSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the field details." }
  }

  await connectDB()

  const field = await FormFieldModel.findById(input.id)
  if (!field) return { ok: false, error: "That field could not be found." }

  const values = { ...parsed.data, options: cleanOptions(parsed.data.options) }

  if (field.isBuiltIn) {
    field.label = values.label
    field.placeholder = values.placeholder
    field.helpText = values.helpText

    // A locked built-in is always collected, so "required" stays true.
    if (!field.isLocked) {
      field.required = values.required
    }

    // Gender is the one built-in whose options are genuinely editable.
    if (field.key === "gender") {
      field.options = values.options
    }
  } else {
    const shapeError = validateFieldShape({
      type: values.type as FieldType,
      options: values.options,
    })
    if (shapeError) return { ok: false, error: shapeError }

    const target = await resolveTarget(String(field.formId ?? values.formId), values.step)
    if (!target) return { ok: false, error: "That step could not be found." }

    // `formId` is not editable here: moving a question between forms would
    // orphan the answers already given to it.
    const { formId: _formId, ...editable } = values
    void _formId
    field.set(editable)
  }

  await field.save()

  await logActivity({
    actorUserId: user.id,
    action: "form.field_updated",
    entityType: "form_field",
    entityId: String(field._id),
    details: { key: field.key, builtIn: field.isBuiltIn },
  })

  refreshPublic()
  return { ok: true }
}

/** Show or hide a field on the public form. */
export async function setFormFieldActive(input: {
  id: string
  isActive: boolean
}): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That field could not be found." }
  }

  const field = await FormFieldModel.findById(input.id)
  if (!field) return { ok: false, error: "That field could not be found." }

  if (field.isLocked && !input.isActive) {
    return {
      ok: false,
      error: `${field.label} is required for registration to work and cannot be hidden.`,
    }
  }

  field.isActive = input.isActive
  await field.save()

  await logActivity({
    actorUserId: user.id,
    action: input.isActive ? "form.field_shown" : "form.field_hidden",
    entityType: "form_field",
    entityId: String(field._id),
    details: { key: field.key },
  })

  refreshPublic()
  return { ok: true }
}

export async function deleteFormField(input: { id: string }): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(input.id)) {
    return { ok: false, error: "That field could not be found." }
  }

  const field = await FormFieldModel.findById(input.id)
  if (!field) return { ok: false, error: "That field could not be found." }

  if (field.isBuiltIn) {
    return {
      ok: false,
      error: "Built-in fields cannot be deleted. Hide it instead if you do not want to collect it.",
    }
  }

  await field.deleteOne()

  // Answers already given are deliberately left on the delegates. Deleting the
  // question should not destroy what people told us.
  await logActivity({
    actorUserId: user.id,
    action: "form.field_deleted",
    entityType: "form_field",
    entityId: input.id,
    details: { key: field.key, label: field.label },
  })

  refreshPublic()
  return { ok: true }
}

/** Persist a drag-and-drop reorder within a step. */
export async function reorderFormFields(input: {
  formId: string
  step: string
  ids: string[]
}): Promise<ActionResult> {
  await requireSuperAdmin()

  if (input.ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { ok: false, error: "That ordering could not be saved." }
  }

  await connectDB()

  const target = await resolveTarget(input.formId, input.step)
  if (!target) return { ok: false, error: "That form or step could not be found." }

  await FormFieldModel.bulkWrite(
    input.ids.map((id, index) => ({
      // Scoped to the form and step, so a tampered id from somewhere else
      // cannot be moved.
      updateOne: {
        filter: { _id: id, formId: target.form._id, step: input.step },
        update: { $set: { order: (index + 1) * 10 } },
      },
    }))
  )

  refreshPublic(target.form.slug)
  return { ok: true }
}
