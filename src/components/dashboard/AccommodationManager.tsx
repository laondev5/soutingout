"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BedDouble, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
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
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader"
import {
  createAccommodation,
  deleteAccommodation,
  setAccommodationActive,
  updateAccommodation,
} from "@/actions/accommodation.actions"
import { formatNaira, PRICING_MODES, type PricingMode } from "@/lib/constants"

export type AccommodationRow = {
  id: string
  name: string
  codePrefix: string
  description: string
  pricePerPerson: number
  pricingMode: PricingMode
  isFree: boolean
  capacityPerUnit: number
  totalBeds: number
  bedsTaken: number
  bedsAvailable: number
  isActive: boolean
  sortOrder: number
  images: UploadedImage[]
}

type Draft = {
  id?: string
  name: string
  codePrefix: string
  description: string
  isFree: boolean
  pricePerPerson: string
  pricingMode: PricingMode
  capacityPerUnit: string
  totalBeds: string
  isActive: boolean
  sortOrder: string
  images: UploadedImage[]
}

const BLANK: Draft = {
  name: "",
  codePrefix: "",
  description: "",
  isFree: false,
  pricePerPerson: "",
  pricingMode: "per_person",
  capacityPerUnit: "1",
  totalBeds: "",
  isActive: true,
  sortOrder: "0",
  images: [],
}

function toDraft(row: AccommodationRow): Draft {
  return {
    id: row.id,
    name: row.name,
    codePrefix: row.codePrefix,
    description: row.description,
    isFree: row.isFree,
    pricePerPerson: String(row.pricePerPerson),
    pricingMode: row.pricingMode,
    capacityPerUnit: String(row.capacityPerUnit),
    totalBeds: String(row.totalBeds),
    isActive: row.isActive,
    sortOrder: String(row.sortOrder),
    images: row.images,
  }
}

const PRICING_LABELS: Record<PricingMode, string> = {
  per_person: "Per person — each person in the party pays this",
  flat: "Flat — one price for the whole unit, however many come",
}

export function AccommodationManager({
  accommodations,
  uploadsEnabled,
}: {
  accommodations: AccommodationRow[]
  uploadsEnabled: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!draft) return

    const payload = {
      name: draft.name,
      codePrefix: draft.codePrefix,
      description: draft.description,
      isFree: draft.isFree,
      pricePerPerson: Number(draft.pricePerPerson || 0),
      pricingMode: draft.pricingMode,
      capacityPerUnit: Number(draft.capacityPerUnit || 1),
      totalBeds: Number(draft.totalBeds || 0),
      images: draft.images,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder || 0),
    }

    startTransition(async () => {
      const result = draft.id
        ? await updateAccommodation({ ...payload, id: draft.id })
        : await createAccommodation(payload)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(draft.id ? "Accommodation updated." : "Accommodation added.")
      setDraft(null)
      router.refresh()
    })
  }

  function toggleActive(row: AccommodationRow) {
    startTransition(async () => {
      const result = await setAccommodationActive({ id: row.id, isActive: !row.isActive })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(row.isActive ? `${row.name} hidden from registration.` : `${row.name} is live.`)
      router.refresh()
    })
  }

  function remove(row: AccommodationRow) {
    startTransition(async () => {
      const result = await deleteAccommodation({ id: row.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${row.name} deleted.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accommodation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Beds, price and photos for every tier on the registration form.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...BLANK })}>
          <Plus className="size-4" /> Add accommodation
        </Button>
      </div>

      {!uploadsEnabled ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Cloudinary is not configured, so photo uploads are turned off. Everything else works.
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {accommodations.map((row) => {
          const full = row.bedsAvailable === 0
          const pct = row.totalBeds > 0 ? Math.round((row.bedsTaken / row.totalBeds) * 100) : 0

          return (
            <li key={row.id} className="overflow-hidden rounded-xl border">
              {row.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.images[0].url} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 items-center justify-center bg-muted/50">
                  <BedDouble className="size-8 text-muted-foreground/50" />
                </div>
              )}

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{row.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.codePrefix}-…
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!row.isActive ? <Badge variant="outline">Hidden</Badge> : null}
                    {full ? <Badge variant="destructive">Full</Badge> : null}
                  </div>
                </div>

                {row.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
                ) : null}

                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">
                    {row.isFree ? "Free" : formatNaira(row.pricePerPerson)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.pricingMode === "flat" ? "per unit" : "per person"}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {row.bedsTaken} of {row.totalBeds} beds taken
                    </span>
                    <span>{row.bedsAvailable} left</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(row))}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => toggleActive(row)}
                  >
                    {row.isActive ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => remove(row)}
                    className="text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {accommodations.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No accommodation yet. Add one, or run <code>npm run seed:accommodations</code>.
        </p>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit accommodation" : "Add accommodation"}</DialogTitle>
            <DialogDescription>
              The code prefix becomes part of every delegate code issued here, e.g.{" "}
              <span className="font-mono">{(draft?.codePrefix || "GEN").toUpperCase()}-KMS26-0007</span>.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-name">Name</Label>
                  <Input
                    id="acc-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="General hostel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-prefix">Code prefix</Label>
                  <Input
                    id="acc-prefix"
                    value={draft.codePrefix}
                    onChange={(e) =>
                      setDraft({ ...draft, codePrefix: e.target.value.toUpperCase() })
                    }
                    placeholder="GEN"
                    maxLength={6}
                    className="font-mono uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-description">Description</Label>
                <Textarea
                  id="acc-description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  placeholder="Shared rooms, bunk beds, communal bathrooms."
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.isFree}
                  onCheckedChange={(checked) => setDraft({ ...draft, isFree: checked === true })}
                />
                This accommodation is free
              </label>

              {!draft.isFree ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-price">Price (₦)</Label>
                    <Input
                      id="acc-price"
                      type="number"
                      min={0}
                      value={draft.pricePerPerson}
                      onChange={(e) => setDraft({ ...draft, pricePerPerson: e.target.value })}
                      placeholder="35000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-mode">Charged</Label>
                    <select
                      id="acc-mode"
                      value={draft.pricingMode}
                      onChange={(e) =>
                        setDraft({ ...draft, pricingMode: e.target.value as PricingMode })
                      }
                      className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    >
                      {PRICING_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode === "flat" ? "Flat (whole unit)" : "Per person"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {PRICING_LABELS[draft.pricingMode]}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-beds">Total beds</Label>
                  <Input
                    id="acc-beds"
                    type="number"
                    min={0}
                    value={draft.totalBeds}
                    onChange={(e) => setDraft({ ...draft, totalBeds: e.target.value })}
                    placeholder="120"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-capacity">Beds per unit</Label>
                  <Input
                    id="acc-capacity"
                    type="number"
                    min={1}
                    value={draft.capacityPerUnit}
                    onChange={(e) => setDraft({ ...draft, capacityPerUnit: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-order">Sort order</Label>
                  <Input
                    id="acc-order"
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                  />
                </div>
              </div>

              {uploadsEnabled ? (
                <div className="space-y-1.5">
                  <Label>Photos</Label>
                  <ImageUploader
                    kind="accommodation"
                    images={draft.images}
                    onChange={(images) => setDraft({ ...draft, images })}
                    label="Add photo"
                  />
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked === true })}
                />
                Show on the registration form
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {draft?.id ? "Save changes" : "Add accommodation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
