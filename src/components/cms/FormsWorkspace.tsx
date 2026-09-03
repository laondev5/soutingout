"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FormBuilder } from "@/components/cms/FormBuilder"
import {
  createForm,
  deleteForm,
  duplicateForm,
  setFormPublished,
  updateForm,
} from "@/actions/forms.actions"
import type { FormFieldConfig } from "@/lib/form-fields"
import type { FormSummary } from "@/lib/forms"

/**
 * The form-builder workspace.
 *
 * The registration form is one entry among several, but a special one: its
 * answers become Delegate records, so its address, its built-in steps and its
 * built-in fields are fixed. Every other form is the super admin's own and
 * writes to its own collection.
 */
export function FormsWorkspace({
  forms,
  activeForm,
  fields,
}: {
  forms: FormSummary[]
  activeForm: FormSummary
  fields: FormFieldConfig[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [showSettings, setShowSettings] = useState(false)

  const isRegistration = activeForm.kind === "registration"

  function onCreate() {
    const name = newName.trim()
    if (!name) return

    startTransition(async () => {
      const result = await createForm({ name })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`"${name}" created. Answers will go to its own collection.`)
      setNewName("")
      setCreating(false)
      router.push(`/dashboard/form-builder?form=${result.id}`)
    })
  }

  function togglePublished() {
    startTransition(async () => {
      const result = await setFormPublished({
        formId: activeForm.id,
        isPublished: !activeForm.isPublished,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(activeForm.isPublished ? "Form taken offline." : "Form is live.")
      router.refresh()
    })
  }

  function onDuplicate() {
    startTransition(async () => {
      const result = await duplicateForm({ formId: activeForm.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Copied to /forms/${result.slug}.`)
      router.push(`/dashboard/form-builder?form=${result.id}`)
    })
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete "${activeForm.name}" and its ${activeForm.submissionCount} answer${activeForm.submissionCount === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await deleteForm({ formId: activeForm.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Form deleted.")
      router.push("/dashboard/form-builder")
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Form builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the registration form, or build forms of your own. Each new form gets its own
          collection in the database.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Label htmlFor="form-target" className="pl-1 text-xs uppercase tracking-wide text-muted-foreground">
          Editing
        </Label>

        <select
          id="form-target"
          value={activeForm.id}
          onChange={(event) => router.push(`/dashboard/form-builder?form=${event.target.value}`)}
          className="h-9 min-w-56 max-w-full rounded-md border bg-transparent px-2 text-sm"
        >
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
              {form.kind === "standalone" ? ` — /forms/${form.slug}` : ""}
              {form.kind === "standalone" && !form.isPublished ? " (draft)" : ""}
            </option>
          ))}
        </select>

        {creating ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={newName}
              placeholder="New form name"
              aria-label="New form name"
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreate()
                if (event.key === "Escape") setCreating(false)
              }}
              className="h-9 max-w-64"
            />
            <Button size="sm" onClick={onCreate} disabled={pending || !newName.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New form
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isRegistration ? (
            <Badge>Registration</Badge>
          ) : (
            <Badge variant={activeForm.isPublished ? "default" : "secondary"}>
              {activeForm.isPublished ? "Live" : "Not published"}
            </Badge>
          )}

          <code className="truncate text-xs text-muted-foreground">
            {isRegistration ? "/register" : `/forms/${activeForm.slug}`}
          </code>

          {(isRegistration || activeForm.isPublished) ? (
            <Link
              href={isRegistration ? "/register" : `/forms/${activeForm.slug}`}
              target="_blank"
              aria-label="Open the live form"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          ) : null}

          {!isRegistration ? (
            <span className="text-xs text-muted-foreground">
              {activeForm.submissionCount} response
              {activeForm.submissionCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {!isRegistration ? (
            <Link
              href={`/dashboard/form-builder/${activeForm.id}/responses`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Inbox className="size-4" /> Responses
            </Link>
          ) : null}

          <Button variant="ghost" size="sm" onClick={() => setShowSettings((open) => !open)}>
            <Settings2 className="size-4" /> Settings
          </Button>

          {!isRegistration ? (
            <>
              <Button variant="ghost" size="sm" onClick={togglePublished} disabled={pending}>
                {activeForm.isPublished ? "Take offline" : "Put live"}
              </Button>
              <Button variant="ghost" size="sm" onClick={onDuplicate} disabled={pending}>
                <Copy className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {showSettings ? <FormSettings form={activeForm} /> : null}

      <FormBuilder key={activeForm.id} form={activeForm} fields={fields} />
    </div>
  )
}

function FormSettings({ form }: { form: FormSummary }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    name: form.name,
    slug: form.slug,
    description: form.description,
    submitButtonLabel: form.submitButtonLabel,
    successMessage: form.successMessage,
    notifyEmails: form.notifyEmails.join(", "),
  })

  function save() {
    startTransition(async () => {
      const result = await updateForm({
        formId: form.id,
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        submitButtonLabel: draft.submitButtonLabel,
        successMessage: draft.successMessage,
        notifyEmails: draft.notifyEmails
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success("Settings saved.")
      router.refresh()
    })
  }

  const isRegistration = form.kind === "registration"

  return (
    <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="form-name">Name</Label>
        <Input
          id="form-name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="form-slug">Web address</Label>
        <Input
          id="form-slug"
          value={draft.slug}
          disabled={isRegistration}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
        />
        {isRegistration ? (
          <p className="text-xs text-muted-foreground">
            The registration form always lives at /register.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="form-description">Description</Label>
        <Textarea
          id="form-description"
          rows={2}
          value={draft.description}
          placeholder="Shown under the title on the form itself."
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="form-submit">Submit button label</Label>
        <Input
          id="form-submit"
          value={draft.submitButtonLabel}
          onChange={(event) => setDraft({ ...draft, submitButtonLabel: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="form-notify">Email responses to</Label>
        <Input
          id="form-notify"
          value={draft.notifyEmails}
          placeholder="one@example.com, two@example.com"
          onChange={(event) => setDraft({ ...draft, notifyEmails: event.target.value })}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="form-success">Thank-you message</Label>
        <Textarea
          id="form-success"
          rows={2}
          value={draft.successMessage}
          onChange={(event) => setDraft({ ...draft, successMessage: event.target.value })}
        />
      </div>

      <div className="sm:col-span-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </div>
  )
}
