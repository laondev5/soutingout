"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updateDelegate } from "@/actions/delegate.actions"
import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  GENDERS,
  companionStepFor,
  familyMemberCount,
  formatNaira,
  type AdditionalServiceId,
  type ComingWith,
  type Gender,
} from "@/lib/constants"

export type EditableCompanion = {
  fullName: string
  phone: string
  whatsapp: string
  gender: Gender | null
}

export type EditableDelegate = {
  fullName: string
  email: string
  phoneNumber: string
  whatsappNumber: string
  gender: Gender | null
  comingWith: ComingWith
  companions: EditableCompanion[]
  comments: string
  additionalServices: AdditionalServiceId[]
}

function emptyCompanion(): EditableCompanion {
  return { fullName: "", phone: "", whatsapp: "", gender: null }
}

/** How many companion rows an answer asks for, and what to call each one. */
function companionSlots(comingWith: ComingWith) {
  const step = companionStepFor(comingWith)

  if (step === "partner") {
    return {
      count: 1,
      label: comingWith === "My spouse" ? "Spouse" : "Friend / sibling",
      numbered: false,
    }
  }

  if (step === "family") {
    return { count: familyMemberCount(comingWith), label: "Family member", numbered: true }
  }

  return { count: 0, label: "", numbered: false }
}

/**
 * The delegate's own details, read-only until someone with `delegates.edit`
 * opens the form.
 *
 * Editing "coming with" or the extras changes what they owe, so the form says
 * so before it is saved rather than letting the balance move silently.
 */
export function DelegateDetailsCard({
  delegateId,
  canEdit,
  isCancelled,
  delegate,
  accommodationName,
  registeredOn,
  source,
}: {
  delegateId: string
  canEdit: boolean
  isCancelled: boolean
  delegate: EditableDelegate
  accommodationName: string
  registeredOn: string
  source: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditableDelegate>(delegate)

  const slots = companionSlots(draft.comingWith)

  // Kept long enough to fill the visible rows; shrinking the answer hides the
  // extra names rather than throwing them away, so switching back restores them.
  const companionRows = Array.from(
    { length: slots.count },
    (_, index) => draft.companions[index] ?? emptyCompanion()
  )

  // Only warn about money when the two fields that move it have actually moved.
  const repricing =
    draft.comingWith !== delegate.comingWith ||
    [...draft.additionalServices].sort().join(",") !==
      [...delegate.additionalServices].sort().join(",")

  function setCompanion(index: number, patch: Partial<EditableCompanion>) {
    setDraft((current) => {
      const companions = [...current.companions]
      while (companions.length <= index) companions.push(emptyCompanion())
      companions[index] = { ...companions[index], ...patch }
      return { ...current, companions }
    })
  }

  function toggleService(id: AdditionalServiceId, on: boolean) {
    setDraft((current) => ({
      ...current,
      additionalServices: on
        ? [...new Set([...current.additionalServices, id])]
        : current.additionalServices.filter((service) => service !== id),
    }))
  }

  function onCancel() {
    setDraft(delegate)
    setEditing(false)
  }

  function onSave() {
    startTransition(async () => {
      const result = await updateDelegate({
        delegateId,
        fullName: draft.fullName,
        email: draft.email,
        phoneNumber: draft.phoneNumber,
        whatsappNumber: draft.whatsappNumber,
        gender: draft.gender,
        comingWith: draft.comingWith,
        companions: companionRows.map((companion) => ({
          fullName: companion.fullName,
          phone: companion.phone,
          whatsapp: companion.whatsapp,
          gender: companion.gender,
        })),
        comments: draft.comments,
        additionalServices: draft.additionalServices,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(
        repricing
          ? `Details saved. New total: ${formatNaira(result.totalDue)}.`
          : "Details saved."
      )
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Registration</CardTitle>
          {canEdit && !isCancelled ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit details
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Email">{delegate.email}</Detail>
            <Detail label="Phone">{delegate.phoneNumber}</Detail>
            <Detail label="WhatsApp">{delegate.whatsappNumber}</Detail>
            <Detail label="Gender">{delegate.gender ?? "—"}</Detail>
            <Detail label="Coming with">{delegate.comingWith}</Detail>
            <Detail label="Accommodation">{accommodationName}</Detail>
            <Detail label="Registered">{registeredOn}</Detail>
            <Detail label="Source">{source}</Detail>
          </dl>

          {delegate.additionalServices.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Additional services
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ADDITIONAL_SERVICES.filter((service) =>
                  delegate.additionalServices.includes(service.id)
                ).map((service) => (
                  <Badge key={service.id} variant="secondary">
                    {service.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {delegate.comments ? (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Comments</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                {delegate.comments}
              </p>
            </div>
          ) : null}

          {delegate.companions.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Coming with ({delegate.companions.length})
              </p>
              <ul className="mt-2 divide-y">
                {delegate.companions.map((companion, index) => (
                  <li key={index} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{companion.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[companion.gender, companion.phone, companion.whatsapp]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit registration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" id="d-name">
            <Input
              id="d-name"
              value={draft.fullName}
              onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
            />
          </Field>
          <Field label="Email" id="d-email">
            <Input
              id="d-email"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </Field>
          <Field label="Phone number" id="d-phone">
            <Input
              id="d-phone"
              value={draft.phoneNumber}
              onChange={(event) => setDraft({ ...draft, phoneNumber: event.target.value })}
            />
          </Field>
          <Field label="WhatsApp number" id="d-whatsapp">
            <Input
              id="d-whatsapp"
              value={draft.whatsappNumber}
              onChange={(event) => setDraft({ ...draft, whatsappNumber: event.target.value })}
            />
          </Field>
          <Field label="Gender" id="d-gender">
            <select
              id="d-gender"
              value={draft.gender ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, gender: (event.target.value || null) as Gender | null })
              }
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">Not stated</option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Coming with" id="d-coming">
            <select
              id="d-coming"
              value={draft.comingWith}
              onChange={(event) =>
                setDraft({ ...draft, comingWith: event.target.value as ComingWith })
              }
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            >
              {COMING_WITH_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {companionRows.length > 0 ? (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm font-medium">
              {slots.label} details
            </p>
            {companionRows.map((companion, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={slots.numbered ? `${slots.label} ${index + 1} — name` : "Full name"}
                  id={`c-name-${index}`}
                >
                  <Input
                    id={`c-name-${index}`}
                    value={companion.fullName}
                    onChange={(event) => setCompanion(index, { fullName: event.target.value })}
                  />
                </Field>
                <Field label="Gender" id={`c-gender-${index}`}>
                  <select
                    id={`c-gender-${index}`}
                    value={companion.gender ?? ""}
                    onChange={(event) =>
                      setCompanion(index, {
                        gender: (event.target.value || null) as Gender | null,
                      })
                    }
                    className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                  >
                    <option value="">Not stated</option>
                    {GENDERS.map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </select>
                </Field>
                {!slots.numbered ? (
                  <>
                    <Field label="Phone" id={`c-phone-${index}`}>
                      <Input
                        id={`c-phone-${index}`}
                        value={companion.phone}
                        onChange={(event) => setCompanion(index, { phone: event.target.value })}
                      />
                    </Field>
                    <Field label="WhatsApp" id={`c-whatsapp-${index}`}>
                      <Input
                        id={`c-whatsapp-${index}`}
                        value={companion.whatsapp}
                        onChange={(event) => setCompanion(index, { whatsapp: event.target.value })}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">Additional services</p>
          {ADDITIONAL_SERVICES.map((service) => (
            <label key={service.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.additionalServices.includes(service.id)}
                onCheckedChange={(checked) => toggleService(service.id, checked === true)}
              />
              {service.name} — {formatNaira(service.price)}
            </label>
          ))}
        </div>

        <Field label="Comments" id="d-comments">
          <Textarea
            id="d-comments"
            rows={3}
            value={draft.comments}
            onChange={(event) => setDraft({ ...draft, comments: event.target.value })}
          />
        </Field>

        {repricing ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            This changes what the delegate owes. Their beds and balance are recalculated on save —
            anything already paid stays paid.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

function Field({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
