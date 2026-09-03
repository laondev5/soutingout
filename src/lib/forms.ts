import "server-only"
import mongoose from "mongoose"
import { updateTag } from "next/cache"
import { FormDefinitionModel, FormFieldModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { FORM_STEPS, type FormFieldConfig } from "@/lib/form-fields"
import { toFieldConfig } from "@/lib/form-config"

const FORMS_TAG = "form-definitions"

/** The registration form's fixed slug. There is exactly one of it. */
export const REGISTRATION_FORM_SLUG = "registration"

export type FormStep = {
  id: string
  name: string
  description: string
  order: number
  isBuiltIn: boolean
  isActive: boolean
}

export type FormSummary = {
  id: string
  slug: string
  name: string
  description: string
  kind: "registration" | "standalone"
  collectionName: string
  isPublished: boolean
  submitButtonLabel: string
  successMessage: string
  notifyEmails: string[]
  steps: FormStep[]
  submissionCount: number
  fieldCount: number
}

/**
 * Where a standalone form's answers live.
 *
 * Each form gets its own MongoDB collection, so one form's answers can be
 * browsed, exported or dropped without touching another's — and so a field
 * called `name` on one form is unrelated to a field called `name` on the next.
 */
export function collectionNameFor(slug: string) {
  return `form_${slug.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`
}

function toStep(step: {
  id: string
  name: string
  description?: string
  order?: number
  isBuiltIn?: boolean
  isActive?: boolean
}): FormStep {
  return {
    id: step.id,
    name: step.name,
    description: step.description ?? "",
    order: step.order ?? 0,
    isBuiltIn: step.isBuiltIn ?? false,
    isActive: step.isActive !== false,
  }
}

/**
 * Make sure the registration form exists as a `FormDefinition`.
 *
 * It predates this table — its fields were rows with no owner — so the first
 * run also stamps `formId` onto them. Idempotent, and safe to call on any
 * request that needs the form.
 */
export async function ensureRegistrationForm() {
  await connectDB()

  const steps = FORM_STEPS.map((step, index) => ({
    id: step.id,
    name: step.name,
    description: "",
    order: (index + 1) * 10,
    isBuiltIn: true,
    isActive: true,
  }))

  let form = await FormDefinitionModel.findOne({ kind: "registration" })

  if (!form) {
    form = await FormDefinitionModel.create({
      slug: REGISTRATION_FORM_SLUG,
      name: "Delegate registration",
      description: "The public registration stepper. Its answers become Delegate records.",
      kind: "registration",
      collectionName: "",
      isPublished: true,
      submitButtonLabel: "Submit registration",
      successMessage: "Thank you — we have your registration.",
      steps,
    })
  } else if (form.steps.length === 0) {
    form.steps = steps
    await form.save()
  }

  // Fields written before forms had identity.
  await FormFieldModel.updateMany({ formId: null }, { $set: { formId: form._id } })

  return form
}

async function loadForms(): Promise<FormSummary[]> {
  await connectDB()
  await ensureRegistrationForm()

  const forms = await FormDefinitionModel.find().sort({ kind: 1, name: 1 }).lean()

  const counts = await FormFieldModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { formId: { $in: forms.map((form) => form._id) } } },
    { $group: { _id: "$formId", count: { $sum: 1 } } },
  ])

  const fieldCount = new Map(counts.map((row) => [String(row._id), row.count]))

  return forms.map((form) => ({
    id: String(form._id),
    slug: form.slug,
    name: form.name,
    description: form.description,
    kind: form.kind,
    collectionName: form.collectionName,
    isPublished: form.isPublished,
    submitButtonLabel: form.submitButtonLabel,
    successMessage: form.successMessage,
    notifyEmails: form.notifyEmails ?? [],
    steps: (form.steps ?? []).map(toStep).sort((a, b) => a.order - b.order),
    submissionCount: form.submissionCount ?? 0,
    fieldCount: fieldCount.get(String(form._id)) ?? 0,
  }))
}

export async function listForms() {
  return loadForms()
}

export async function getForm(id: string): Promise<FormSummary | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  const forms = await loadForms()
  return forms.find((form) => form.id === id) ?? null
}

/** The published form behind a public URL, with its fields. */
async function loadPublicForm(slug: string) {
  await connectDB()

  const form = await FormDefinitionModel.findOne({
    slug,
    kind: "standalone",
    isPublished: true,
  }).lean()

  if (!form) return null

  const fields = await FormFieldModel.find({ formId: form._id, isActive: true })
    .sort({ order: 1 })
    .lean()

  return {
    id: String(form._id),
    slug: form.slug,
    name: form.name,
    description: form.description,
    submitButtonLabel: form.submitButtonLabel,
    successMessage: form.successMessage,
    steps: (form.steps ?? []).map(toStep).filter((step) => step.isActive).sort((a, b) => a.order - b.order),
    fields: fields.map(toFieldConfig),
  }
}

/**
 * Deliberately uncached.
 *
 * This is read both to render a form and to validate an answer to it, and a
 * stale copy of the second would accept an answer to a question that no longer
 * exists — or reject one that does. The page is dynamic anyway, and these
 * forms see nothing like the traffic that would justify the risk.
 */
export const getPublicForm = (slug: string) => loadPublicForm(slug)

/** Every field on one form, for the builder. */
export async function getFormFieldsFor(formId: string): Promise<FormFieldConfig[]> {
  await connectDB()

  if (!mongoose.Types.ObjectId.isValid(formId)) return []

  const rows = await FormFieldModel.find({ formId }).sort({ step: 1, order: 1 }).lean()
  return rows.map(toFieldConfig)
}

export function invalidateForms() {
  updateTag(FORMS_TAG)
}

// ── Submissions ──────────────────────────────────────────────────────

/** Keys a submission document uses itself, and so cannot be a field key. */
export const SUBMISSION_RESERVED_KEYS = new Set(["_id", "submittedAt", "formSlug"])

export type Submission = {
  id: string
  submittedAt: string
  answers: Record<string, unknown>
}

/**
 * Read a page of one form's answers straight from its own collection.
 *
 * The collection is reached through the native driver rather than a Mongoose
 * model: its shape is whatever the super admin built, so there is no schema to
 * declare and nothing would be gained by pretending otherwise.
 */
export async function listSubmissions(
  collectionName: string,
  options: { page?: number; pageSize?: number } = {}
) {
  await connectDB()

  if (!collectionName) return { items: [] as Submission[], total: 0, page: 1, pageCount: 1 }

  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 25))
  const page = Math.max(1, options.page ?? 1)

  const collection = mongoose.connection.collection(collectionName)

  const [total, rows] = await Promise.all([
    collection.countDocuments({}),
    collection
      .find({})
      .sort({ submittedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ])

  const items: Submission[] = rows.map((row) => {
    const { _id, submittedAt, formSlug, ...answers } = row as Record<string, unknown> & {
      _id: unknown
      submittedAt?: Date
    }
    void formSlug

    return {
      id: String(_id),
      submittedAt: submittedAt ? new Date(submittedAt).toISOString() : "",
      answers,
    }
  })

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Drop a form's whole answer collection. Used when the form itself is deleted. */
export async function dropSubmissions(collectionName: string) {
  if (!collectionName) return

  await connectDB()

  try {
    await mongoose.connection.collection(collectionName).drop()
  } catch (error) {
    // Dropping a collection that was never written to throws 26 (NamespaceNotFound),
    // which is the same end state we wanted.
    if ((error as { codeName?: string }).codeName !== "NamespaceNotFound") throw error
  }
}
