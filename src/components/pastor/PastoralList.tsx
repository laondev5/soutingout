"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Mail, Phone, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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

export function PastoralList({ delegates }: { delegates: PastoralDelegate[] }) {
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

      <Dialog open={active !== null} onOpenChange={(isOpen) => !isOpen && setActive(null)}>
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
              <Button variant="outline" onClick={() => save("pending")} disabled={pending}>
                <Undo2 className="size-4" /> Back to pending
              </Button>
            ) : null}
            <Button onClick={() => save("seen")} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save as seen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
