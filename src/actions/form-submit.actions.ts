"use server"

import mongoose from "mongoose"
import { FormDefinitionModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { customFieldsSchema } from "@/lib/form-config"
import { getPublicForm, SUBMISSION_RESERVED_KEYS } from "@/lib/forms"
import { trySendEmail } from "@/lib/email"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Take an answer to one of the super admin's own forms.
 *
 * Public by design — these forms are for anyone with the link — so nothing is
 * trusted: the questions are re-read from the database and the answers are
 * validated against them here, not against whatever the browser thought the
 * form looked like.
 */
export async function submitForm(input: {
  slug: string
  answers: Record<string, unknown>
}): Promise<ActionResult<{ message: string }>> {
  const form = await getPublicForm(input.slug)

  if (!form) {
    return { ok: false, error: "This form is not accepting answers." }
  }

  const parsed = customFieldsSchema(form.fields).safeParse(input.answers ?? {})

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your answers and try again.",
    }
  }

  await connectDB()

  const definition = await FormDefinitionModel.findById(form.id).select(
    "collectionName notifyEmails name slug"
  )

  if (!definition?.collectionName) {
    return { ok: false, error: "This form is not accepting answers." }
  }

  // Only keys that belong to a real question survive, and never one that would
  // shadow the document's own bookkeeping.
  const answers: Record<string, unknown> = {}
  for (const field of form.fields) {
    if (SUBMISSION_RESERVED_KEYS.has(field.key)) continue
    if (field.key in parsed.data) {
      answers[field.key] = (parsed.data as Record<string, unknown>)[field.key]
    }
  }

  await mongoose.connection.collection(definition.collectionName).insertOne({
    submittedAt: new Date(),
    ...answers,
  })

  await FormDefinitionModel.updateOne({ _id: definition._id }, { $inc: { submissionCount: 1 } })

  // Notification is a courtesy; a mail failure must not lose the answer that
  // has already been written.
  if (definition.notifyEmails.length > 0) {
    const lines = form.fields
      .filter((field) => field.key in answers)
      .map((field) => `${field.label}: ${formatAnswer(answers[field.key])}`)

    await trySendEmail({
      to: definition.notifyEmails.join(","),
      subject: `New response — ${definition.name}`,
      text: `A new response to "${definition.name}".\n\n${lines.join("\n")}`,
      html: `<p>A new response to <strong>${escapeHtml(definition.name)}</strong>.</p><ul>${lines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`,
    })
  }

  return { ok: true, message: form.successMessage || "Thank you — we have your answers." }
}

function formatAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (value === null || value === undefined || value === "") return "—"
  return String(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
