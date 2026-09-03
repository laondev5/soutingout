"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BanknoteArrowUp, Eye, Loader2, MoreHorizontal, Trash2, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  cancelRegistration,
  deleteDelegate,
  recordManualPayment,
} from "@/actions/delegate.actions"
import { formatNaira } from "@/lib/constants"

export type DelegateActionRow = {
  id: string
  fullName: string
  balance: number
  isCancelled: boolean
  hasIdentifiers: boolean
}

/**
 * The per-row menu on the delegate list.
 *
 * Everything here is also reachable from the delegate's own page — this exists
 * so the common jobs (take a payment, remove a duplicate) do not cost two page
 * loads each.
 */
export function DelegateRowActions({
  delegate,
  canConfirmPayments,
  canDelete,
  canEdit,
}: {
  delegate: DelegateActionRow
  canConfirmPayments: boolean
  canDelete: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [payOpen, setPayOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [amount, setAmount] = useState(delegate.balance > 0 ? String(delegate.balance) : "")
  const [note, setNote] = useState("")

  function confirmPayment() {
    startTransition(async () => {
      const result = await recordManualPayment({
        delegateId: delegate.id,
        amount: Number(amount),
        note,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(`Payment recorded for ${delegate.fullName}. They have been emailed.`)
      setPayOpen(false)
      setNote("")
      router.refresh()
    })
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteDelegate({ delegateId: delegate.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.fullName} deleted.`)
      setDeleteOpen(false)
      router.refresh()
    })
  }

  function onCancel() {
    startTransition(async () => {
      const result = await cancelRegistration({ delegateId: delegate.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Registration cancelled and their beds released.")
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${delegate.fullName}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/delegates/${delegate.id}`)}
          >
            <Eye className="size-4" /> View details
          </DropdownMenuItem>

          {canConfirmPayments && !delegate.isCancelled ? (
            <DropdownMenuItem onClick={() => setPayOpen(true)}>
              <BanknoteArrowUp className="size-4" /> Confirm a payment
            </DropdownMenuItem>
          ) : null}

          {canEdit && !delegate.isCancelled ? (
            <DropdownMenuItem onClick={onCancel}>
              <UserMinus className="size-4" /> Cancel registration
            </DropdownMenuItem>
          ) : null}

          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> Delete delegate
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm a payment</DialogTitle>
            <DialogDescription>
              For {delegate.fullName}.{" "}
              {delegate.balance > 0
                ? `${formatNaira(delegate.balance)} outstanding.`
                : "Nothing is outstanding."}{" "}
              Confirming issues their LFF ID and accommodation code, and emails them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`pay-amount-${delegate.id}`}>Amount paid (₦)</Label>
              <Input
                id={`pay-amount-${delegate.id}`}
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pay-note-${delegate.id}`}>Note</Label>
              <Textarea
                id={`pay-note-${delegate.id}`}
                rows={2}
                placeholder="e.g. transfer seen on WhatsApp, 12 Jan"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirmPayment} disabled={pending || !amount}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {delegate.fullName}?</DialogTitle>
            <DialogDescription>
              This erases the registration, their payments and their pastoral notes, and puts
              their beds back on sale. It cannot be undone.
              {delegate.hasIdentifiers
                ? " They have already been issued an LFF ID — cancelling instead keeps the record."
                : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Keep
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
