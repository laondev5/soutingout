"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Mail, Phone, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ViewMode } from "@/lib/list-params"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { setPastoralStatus } from "@/actions/delegate.actions"
import type { PastoralDelegate } from "@/lib/pastoral"

export function PastoralList({
  delegates,
  view = "cards",
}: {
  delegates: PastoralDelegate[]
  view?: ViewMode
}) {
  const router = useRouter()
  const [active, setActive] = useState<PastoralDelegate | null>(null)
  const [notes, setNotes] = useState("")
  const [pending, startTransition] = useTransition()

  function open(delegate: PastoralDelegate) {
    setActive(delegate)
    setNotes(delegate.notes)
  }

  function save(status: "seen" | "pending") {
    if (!active) return

    startTransition(async () => {
      const result = await setPastoralStatus({ delegateId: active.id, status, notes })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(status === "seen" ? "Marked as seen." : "Moved back to pending.")
      setActive(null)
      router.refresh()
    })
  }

  /** Mark seen straight from the card, keeping any notes already saved. */
  function quickSeen(delegate: PastoralDelegate) {
    startTransition(async () => {
      const result = await setPastoralStatus({
        delegateId: delegate.id,
        status: "seen",
        notes: delegate.notes,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(`${delegate.fullName} marked as seen.`)
      router.refresh()
    })
  }

  if (delegates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        No delegates here yet.
      </p>
    )
  }

  if (view === "table") {
    return (
      <>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delegate</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Coming with</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {delegates.map((delegate) => (
                <TableRow key={delegate.id}>
                  <TableCell>
                    <span className="font-medium">{delegate.fullName}</span>
                    <p className="font-mono text-xs text-muted-foreground">
                      {delegate.lffId ?? "Awaiting payment"}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm">
                    <a href={`tel:${delegate.whatsappNumber || delegate.phoneNumber}`}>
                      {delegate.whatsappNumber || delegate.phoneNumber || "—"}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">{delegate.email}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {delegate.comingWith || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={delegate.status === "seen" ? "default" : "outline"}>
                      {delegate.status === "seen" ? "Seen" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {delegate.status === "pending" ? (
                        <Button
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => quickSeen(delegate)}
                          title="Mark as seen"
                          aria-label={`Mark ${delegate.fullName} as seen`}
                        >
                          <Check className="size-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => open(delegate)}
                      >
                        Notes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <NotesDialog
          active={active}
          notes={notes}
          setNotes={setNotes}
          pending={pending}
          onClose={() => setActive(null)}
          onSave={save}
        />
      </>
    )
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {delegates.map((delegate) => (
          <li key={delegate.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-medium">{delegate.fullName}</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {delegate.lffId ?? "Awaiting payment"}
                </p>
              </div>
              <Badge variant={delegate.status === "seen" ? "default" : "outline"}>
                {delegate.status === "seen" ? "Seen" : "Pending"}
              </Badge>
            </div>

            <dl className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 shrink-0" />
                <a href={`tel:${delegate.whatsappNumber || delegate.phoneNumber}`} className="truncate">
                  {delegate.whatsappNumber || delegate.phoneNumber || "—"}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 shrink-0" />
                <a href={`mailto:${delegate.email}`} className="truncate">
                  {delegate.email}
                </a>
              </div>
            </dl>

            {delegate.comingWith ? (
              <p className="text-xs text-muted-foreground">Coming with: {delegate.comingWith}</p>
            ) : null}

            {delegate.notes ? (
              <p className="line-clamp-2 rounded-md bg-muted/50 p-2 text-xs">{delegate.notes}</p>
            ) : null}

            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              {delegate.status === "pending" ? (
                <Button size="sm" disabled={pending} onClick={() => quickSeen(delegate)}>
                  <Check className="size-3.5" /> I&rsquo;ve seen this person
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => open(delegate)}>
                {delegate.notes ? "Edit notes" : "Add notes"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <NotesDialog
        active={active}
        notes={notes}
        setNotes={setNotes}
        pending={pending}
        onClose={() => setActive(null)}
        onSave={save}
      />
    </>
  )
}

/** One dialog, shared by the card and table views. */
function NotesDialog({
  active,
  notes,
  setNotes,
  pending,
  onClose,
  onSave,
}: {
  active: PastoralDelegate | null
  notes: string
  setNotes: (value: string) => void
  pending: boolean
  onClose: () => void
  onSave: (status: "seen" | "pending") => void
}) {
  return (
    <Dialog open={active !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{active?.fullName}</DialogTitle>
          <DialogDescription>
            Notes are private to you and are not shown to the delegate.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={6}
          placeholder="What you discussed, what to follow up on…"
        />

        <DialogFooter className="gap-2">
          {active?.status === "seen" ? (
            <Button variant="outline" onClick={() => onSave("pending")} disabled={pending}>
              <Undo2 className="size-4" /> Back to pending
            </Button>
          ) : null}
          <Button onClick={() => onSave("seen")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save as seen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
