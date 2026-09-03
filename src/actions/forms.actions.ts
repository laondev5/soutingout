"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { z } from "zod"
import { FormDefinitionModel, FormFieldModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { requireSuperAdmin } from "@/lib/permissions"
import { logActivity } from "@/lib/activity-log"
import {
  collectionNameFor,
  dropSubmissions,
  ensureRegistrationForm,
  invalidateForms,
} from "@/lib/forms"
import { invalidateFormFields } from "@/lib/form-config"
import { slugify } from "@/lib/page-slugs"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const NOT_FOUND = "That form could not be found."

function refresh(slug?: string) {
  invalidateForms()
  invalidateFormFields()
  revalidatePath("/dashboard/form-builder")
  if (slug) revalidatePath(`/forms/${slug}`)
}

async function loadForm(formId: string) {
  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(formId)) return null
  return FormDefinitionModel.findById(formId)
}

// ── Forms ────────────────────────────────────────────────────────────

const formSettingsSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name.").max(160),
  slug: z.string().trim().min(1, "Give the form a web address.").max(80),
  description: z.string().trim().max(500).default(""),
  submitButtonLabel: z.string().trim().min(1).max(60).default("Submit"),
  successMessage: z.string().trim().max(500).default(""),
  notifyEmails: z.array(z.string().trim()).max(10).default([]),
})

export async function createForm(input: {
  name: string
  slug?: string
}): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireSuperAdmin()

  const name = input.name.trim()
  if (!name) return { ok: false, error: "Give the form a name." }

  const slug = slugify(input.slug?.trim() || name)
  if (!slug) return { ok: false, error: "That name does not make a usable web address." }

  await connectDB()
  await ensureRegistrationForm()

  if (await FormDefinitionModel.exists({ slug })) {
    return { ok: false, error: `Another form already lives at "/forms/${slug}".` }
  }

  const form = await FormDefinitionModel.create({
    slug,
    name,
    kind: "standalone",
    // Its own collection, so this form's answers never mix with another's.
    collectionName: collectionNameFor(slug),
    isPublished: false,
    // One step by default: a form with none has nowhere to put a field.
    steps: [
      { id: "step1", name: "Questions", description: "", order: 10, isBuiltIn: false, isActive: true },
    ],
    createdByUserId: new mongoose.Types.ObjectId(user.id),
  })

  await logActivity({
    actorUserId: user.id,
    action: "form.created",
    entityType: "form_field",
    entityId: String(form._id),
    details: { slug, name, collection: form.collectionName },
  })

  refresh(slug)
  return { ok: true, id: String(form._id), slug }
}

export async function updateForm(
  input: z.input<typeof formSettingsSchema> & { formId: string }
): Promise<ActionResult<{ slug: string }>> {
  const user = await requireSuperAdmin()

  const parsed = formSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form settings." }
  }

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  const emails = parsed.data.notifyEmails
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  for (const email of emails) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: `"${email}" is not a valid email address.` }
    }
  }

  const previousSlug = form.slug

  // The registration form's address is wired into the app, so only its
  // wording is editable here.
  if (form.kind === "standalone") {
    const slug = slugify(parsed.data.slug)
    if (!slug) return { ok: false, error: "That web address is not usable." }

    if (slug !== form.slug) {
      if (await FormDefinitionModel.exists({ slug, _id: { $ne: form._id } })) {
        return { ok: false, error: `Another form already lives at "/forms/${slug}".` }
      }
      form.slug = slug
      // The collection keeps its original name on purpose: renaming it would
      // mean moving every answer already in it.
    }
  }

  form.name = parsed.data.name
  form.description = parsed.data.description
  form.submitButtonLabel = parsed.data.submitButtonLabel
  form.successMessage = parsed.data.successMessage
  form.notifyEmails = emails
  await form.save()

  await logActivity({
    actorUserId: user.id,
    action: "form.updated",
    entityType: "form_field",
    entityId: String(form._id),
    details: { slug: form.slug },
  })

  refresh(previousSlug)
  refresh(form.slug)
  return { ok: true, slug: form.slug }
}

export async function setFormPublished(input: {
  formId: string
  isPublished: boolean
}): Promise<ActionResult> {
  await requireSuperAdmin()

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  if (form.kind === "registration") {
    return { ok: false, error: "The registration form is always live." }
  }

  if (input.isPublished) {
    const fields = await FormFieldModel.countDocuments({ formId: form._id, isActive: true })
    if (fields === 0) {
      return { ok: false, error: "Add at least one question before putting this form live." }
    }
  }

  form.isPublished = input.isPublished
  await form.save()

  refresh(form.slug)
  return { ok: true }
}

export async function deleteForm(input: { formId: string }): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  if (form.kind === "registration") {
    return { ok: false, error: "The registration form cannot be deleted." }
  }

  const collectionName = form.collectionName
  const slug = form.slug

  await FormFieldModel.deleteMany({ formId: form._id })
  await FormDefinitionModel.deleteOne({ _id: form._id })

  // The answers go with the form. They are only meaningful next to the
  // questions that produced them, and nothing else reads this collection.
  await dropSubmissions(collectionName)

  await logActivity({
    actorUserId: user.id,
    action: "form.deleted",
    entityType: "form_field",
    entityId: String(form._id),
    details: { slug, name: form.name, collection: collectionName },
  })

  refresh(slug)
  return { ok: true }
}

export async function duplicateForm(
  input: { formId: string }
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireSuperAdmin()

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  let slug = slugify(`${form.slug}-copy`)
  let suffix = 2

  while (await FormDefinitionModel.exists({ slug })) {
    slug = slugify(`${form.slug}-copy-${suffix}`)
    suffix += 1
    if (suffix > 50) return { ok: false, error: "Could not find a free web address." }
  }

  const copy = await FormDefinitionModel.create({
    slug,
    name: `${form.name} (copy)`,
    description: form.description,
    kind: "standalone",
    collectionName: collectionNameFor(slug),
    isPublished: false,
    submitButtonLabel: form.submitButtonLabel,
    successMessage: form.successMessage,
    notifyEmails: form.notifyEmails,
    steps: form.steps,
    createdByUserId: new mongoose.Types.ObjectId(user.id),
  })

  // Questions come across; answers do not — the copy starts empty.
  const fields = await FormFieldModel.find({ formId: form._id }).lean()

  if (fields.length > 0) {
    await FormFieldModel.insertMany(
      fields.map((field) => ({
        formId: copy._id,
        key: field.key,
        label: field.label,
        type: field.type,
        step: field.step,
        required: field.required,
        placeholder: field.placeholder,
        helpText: field.helpText,
        options: field.options,
        order: field.order,
        isActive: field.isActive,
        // A copy is a standalone form, so nothing in it is wired into the app.
        isBuiltIn: false,
        isLocked: false,
      }))
    )
  }

  refresh(slug)
  return { ok: true, id: String(copy._id), slug }
}

// ── Steps ────────────────────────────────────────────────────────────

const stepSchema = z.object({
  name: z.string().trim().min(1, "Give the step a name.").max(120),
  description: z.string().trim().max(400).default(""),
})

export async function createFormStep(
  input: z.input<typeof stepSchema> & { formId: string }
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSuperAdmin()

  const parsed = stepSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the step details." }
  }

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  if (form.steps.length >= 20) {
    return { ok: false, error: "That is as many steps as one form can have." }
  }

  // Ids are what a field's `step` points at, so they have to be stable and
  // unique within the form — a name can be edited freely afterwards.
  const base = slugify(parsed.data.name) || "step"
  let id = base
  let suffix = 2

  while (form.steps.some((step) => step.id === id)) {
    id = `${base}-${suffix}`
    suffix += 1
    if (suffix > 50) return { ok: false, error: "Could not find a free name for that step." }
  }

  const order = Math.max(0, ...form.steps.map((step) => step.order)) + 10

  form.steps.push({
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    order,
    isBuiltIn: false,
    isActive: true,
  })

  await form.save()

  await logActivity({
    actorUserId: user.id,
    action: "form.step_created",
    entityType: "form_field",
    entityId: String(form._id),
    details: { step: id, name: parsed.data.name },
  })

  refresh(form.slug)
  return { ok: true, id }
}

export async function updateFormStep(
  input: z.input<typeof stepSchema> & { formId: string; stepId: string; isActive?: boolean }
): Promise<ActionResult> {
  const user = await requireSuperAdmin()

  const parsed = stepSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the step details." }
  }

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  const step = form.steps.find((entry) => entry.id === input.stepId)
  if (!step) return { ok: false, error: "That step could not be found." }

  if (input.isActive === false && step.isBuiltIn) {
    return {
      ok: false,
      error: "This step collects something the app depends on, so it cannot be switched off.",
    }
  }

  step.name = parsed.data.name
  step.description = parsed.data.description
  if (typeof input.isActive === "boolean") step.isActive = input.isActive

  form.markModified("steps")
  await form.save()

  await logActivity({
    actorUserId: user.id,
    action: "form.step_updated",
    entityType: "form_field",
    entityId: String(form._id),
    details: { step: step.id, name: step.name },
  })

  refresh(form.slug)
  return { ok: true }
}

export async function deleteFormStep(input: {
  formId: string
  stepId: string
  /** Where this step's questions should go instead. */
  moveFieldsTo?: string
}): Promise<ActionResult<{ moved: number }>> {
  const user = await requireSuperAdmin()

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  const step = form.steps.find((entry) => entry.id === input.stepId)
  if (!step) return { ok: false, error: "That step could not be found." }

  if (step.isBuiltIn) {
    return {
      ok: false,
      error: "This step is part of how registration works and cannot be removed.",
    }
  }

  if (form.steps.length === 1) {
    return { ok: false, error: "A form needs at least one step." }
  }

  const fieldCount = await FormFieldModel.countDocuments({
    formId: form._id,
    step: input.stepId,
  })

  let moved = 0

  if (fieldCount > 0) {
    if (!input.moveFieldsTo) {
      return {
        ok: false,
        error: `That step still has ${fieldCount} question${fieldCount === 1 ? "" : "s"}. Choose where they should go.`,
      }
    }

    const destination = form.steps.find((entry) => entry.id === input.moveFieldsTo)
    if (!destination || destination.id === step.id) {
      return { ok: false, error: "Choose a different step for those questions." }
    }

    const result = await FormFieldModel.updateMany(
      { formId: form._id, step: input.stepId },
      { $set: { step: destination.id } }
    )
    moved = result.modifiedCount
  }

  form.steps = form.steps.filter((entry) => entry.id !== input.stepId)
  await form.save()

  await logActivity({
    actorUserId: user.id,
    action: "form.step_deleted",
    entityType: "form_field",
    entityId: String(form._id),
    details: { step: input.stepId, moved, movedTo: input.moveFieldsTo ?? null },
  })

  refresh(form.slug)
  return { ok: true, moved }
}

export async function reorderFormSteps(input: {
  formId: string
  stepIds: string[]
}): Promise<ActionResult> {
  await requireSuperAdmin()

  const form = await loadForm(input.formId)
  if (!form) return { ok: false, error: NOT_FOUND }

  const known = new Map(form.steps.map((step) => [step.id, step]))

  // Anything the caller forgot keeps its place at the end, so a stale page
  // cannot silently drop a step.
  const ordered = [
    ...input.stepIds.filter((id) => known.has(id)),
    ...form.steps.map((step) => step.id).filter((id) => !input.stepIds.includes(id)),
  ]

  form.steps = ordered.map((id, index) => ({ ...known.get(id)!, order: (index + 1) * 10 }))
  form.markModified("steps")
  await form.save()

  refresh(form.slug)
  return { ok: true }
}
