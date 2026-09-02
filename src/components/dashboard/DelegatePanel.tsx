"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  cancelRegistration,
  changeAccommodation,
  reassignDelegate,
  recordManualPayment,
} from "@/actions/delegate.actions"
import type { RegistrationStatus } from "@/lib/constants"

type Option = { id: string; name: string }

export function DelegatePanel({
  delegateId,
  currentAccommodationId,
  currentSubAdminId,
  balance,
  registrationStatus,
  canConfirmPayments,
  canEdit,
  canAssign,
  accommodations,
  subAdmins,
}: {
  delegateId: string
  currentAccommodationId: string | null
  currentSubAdminId: string | null
  balance: number
  registrationStatus: RegistrationStatus
  canConfirmPayments: boolean
  canEdit: boolean
  canAssign: boolean
  accommodations: Option[]
  subAdmins: Option[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "")
  const [note, setNote] = useState("")
  const [accommodationId, setAccommodationId] = useState(currentAccommodationId ?? "")
  const [subAdminId, setSubAdminId] = useState(currentSubAdminId ?? "")
  const [reason, setReason] = useState("")

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.")
        return
      }
      toast.success(success)
      router.refresh()
    })
  }

  const isCancelled = registrationStatus === "cancelled"

  return (
    <div className="space-y-6">
      {canConfirmPayments && !isCancelled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirm a payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Record a transfer you have seen proof of. Confirming issues the delegate&rsquo;s LFF
              ID and accommodation code, and emails them.
            </p>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount paid (₦)</Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                rows={2}
                placeholder="e.g. transfer seen on WhatsApp, 12 Jan"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={pending || !amount}
              onClick={() =>
                run(
                  () =>
                    recordManualPayment({
                      delegateId,
                      amount: Number(amount),
                      note,
                    }),
                  "Payment confirmed — the delegate has been emailed."
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm payment
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canAssign && subAdmins.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reassign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="subAdmin">Sub-admin</Label>
              <select
                id="subAdmin"
                value={subAdminId}
                onChange={(event) => setSubAdminId(event.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              >
                <option value="">Choose…</option>
                {subAdmins.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                placeholder="Optional"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={pending || !subAdminId || subAdminId === currentSubAdminId}
              onClick={() =>
                run(
                  () =>
                    reassignDelegate({
                      delegateId,
                      role: "sub_admin",
                      toUserId: subAdminId,
                      reason,
                    }),
                  "Delegate reassigned — both sub-admins have been emailed."
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Reassign
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canEdit && accommodations.length > 0 && !isCancelled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Move accommodation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Repricing and bed counts follow the move. The accommodation code is reissued; the
              LFF ID stays the same.
            </p>
            <select
              value={accommodationId}
              onChange={(event) => setAccommodationId(event.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              aria-label="Accommodation"
            >
              <option value="">Choose…</option>
              {accommodations.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              className="w-full"
              disabled={pending || !accommodationId || accommodationId === currentAccommodationId}
              onClick={() =>
                run(
                  () => changeAccommodation({ delegateId, accommodationId }),
                  "Accommodation changed."
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Move
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canEdit && !isCancelled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cancel registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Releases their beds back for other delegates. This cannot be undone from here.
            </p>
            <Button
              variant="destructive"
              className="w-full"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Cancel this registration and release their beds?")) return
                run(() => cancelRegistration({ delegateId }), "Registration cancelled.")
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel registration
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
