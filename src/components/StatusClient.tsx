"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Clock, CreditCard, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ImageUploader, type UploadedImage } from "@/components/ImageUploader"
import { lookupStatus, submitReceipt, type DelegateStatus } from "@/actions/status.actions"
import { initializePayment } from "@/actions/payment.actions"
import { COUNSELING_FORM_URL, EVENT, formatNaira } from "@/lib/constants"

export function StatusClient({
  paystackEnabled,
  uploadsEnabled,
  initialReference,
  initialDelegate,
}: {
  paystackEnabled: boolean
  uploadsEnabled: boolean
  initialReference?: string
  /** Loaded server-side from a `/status/<token>` link — skips the search form entirely. */
  initialDelegate?: DelegateStatus
}) {
  const [email, setEmail] = useState("")
  const [lffId, setLffId] = useState("")
  const [fullName, setFullName] = useState("")
  const [ambiguous, setAmbiguous] = useState(false)
  const [delegate, setDelegate] = useState<DelegateStatus | null>(initialDelegate ?? null)
  const [pending, startTransition] = useTransition()

  const [receipts, setReceipts] = useState<UploadedImage[]>([])
  const [amount, setAmount] = useState(initialDelegate ? String(initialDelegate.balance) : "")
  const [payMode, setPayMode] = useState<"full" | "installment">("full")
  const [note, setNote] = useState("")

  function lookup() {
    startTransition(async () => {
      const result = await lookupStatus({ email, lffId, fullName })

      if (!result.ok) {
        toast.error(result.error)
        // "More than one registration" tells the visitor to add a full name —
        // surface that field rather than leave them guessing why it failed.
        if (result.error.startsWith("More than one")) setAmbiguous(true)
        return
      }

      setDelegate(result.delegate)
      setAmount(String(result.delegate.balance))
      setPayMode("full")
    })
  }

  function selectPayMode(mode: "full" | "installment") {
    setPayMode(mode)
    if (!delegate) return
    if (mode === "full") {
      setAmount(String(delegate.balance))
    } else if (Number(amount) >= delegate.balance) {
      setAmount(String(Math.round(delegate.balance / 2)))
    }
  }

  function payOnline() {
    if (!delegate) return

    const payAmount = Number(amount)
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      toast.error("Enter how much you want to pay now.")
      return
    }

    startTransition(async () => {
      const result = await initializePayment({ delegateId: delegate.id, amount: payAmount })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      window.location.href = result.authorizationUrl
    })
  }

  function sendReceipt() {
    if (!delegate) return

    const receipt = receipts[0]
    if (!receipt) {
      toast.error("Attach your transfer receipt first.")
      return
    }

    startTransition(async () => {
      const result = await submitReceipt({
        delegateId: delegate.id,
        receiptUrl: receipt.url,
        receiptPublicId: receipt.publicId,
        amount: Number(amount || 0),
        note,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success("Receipt sent. Taking you to the counseling form…")
      setReceipts([])
      setNote("")
      setDelegate({ ...delegate, hasPendingReceipt: true })

      // Sending the receipt is the moment a transfer-payer has "paid" as far
      // as this app can tell, so it is where they get sent on to the
      // counseling form — the same place a card payer lands after checkout.
      // Delayed just enough that the confirmation is actually read first.
      window.setTimeout(() => {
        window.location.href = COUNSELING_FORM_URL
      }, 1800)
    })
  }

  if (!delegate) {
    return (
      <div className="mx-auto w-full max-w-md space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check your registration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the email you registered with.
          </p>
        </div>

        {initialReference ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Thanks — we&rsquo;re confirming payment{" "}
            <span className="font-mono text-xs">{initialReference}</span>. Look it up below to see
            the latest.
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="status-email">Email</Label>
            <Input
              id="status-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status-lff">LFF ID (optional)</Label>
            <Input
              id="status-lff"
              value={lffId}
              onChange={(event) => setLffId(event.target.value.toUpperCase())}
              placeholder={`LFF-${EVENT.tag}-0001`}
              className="font-mono"
            />
          </div>

          {ambiguous ? (
            <div className="space-y-1.5">
              <Label htmlFor="status-name">Full name</Label>
              <Input
                id="status-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="As you registered it"
              />
              <p className="text-xs text-muted-foreground">
                More than one registration uses this email — enter the full name to find yours.
              </p>
            </div>
          ) : null}

          <Button onClick={lookup} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Find my registration
          </Button>
        </div>
      </div>
    )
  }

  const confirmed = delegate.registrationStatus === "confirmed"

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{delegate.fullName}</h1>
          <p className="text-sm text-muted-foreground">{delegate.email}</p>
        </div>
        <Badge variant={confirmed ? "default" : "outline"} className="shrink-0 capitalize">
          {delegate.registrationStatus}
        </Badge>
      </div>

      {confirmed ? (
        <div className="space-y-3 rounded-xl border p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> You&rsquo;re confirmed
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">LFF ID</dt>
              <dd className="font-mono font-medium">{delegate.lffId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Accommodation code</dt>
              <dd className="font-mono font-medium">{delegate.accommodationCode}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Accommodation</dt>
              <dd className="text-right">{delegate.accommodationName ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Bring both codes with you to {EVENT.venue}.
          </p>
          <a
            href={COUNSELING_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ className: "w-full" })}
          >
            Continue to the counseling form
          </a>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border p-5">
        <h2 className="text-sm font-medium">Payment</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums">{formatNaira(delegate.totalDue)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="tabular-nums">{formatNaira(delegate.totalPaid)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t pt-2 font-medium">
            <dt>Balance</dt>
            <dd className="tabular-nums">{formatNaira(delegate.balance)}</dd>
          </div>
        </dl>

        {delegate.hasPendingReceipt ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            A receipt is waiting to be confirmed.
          </p>
        ) : null}
      </div>

      {delegate.balance > 0 ? (
        <>
          <div className="space-y-3 rounded-xl border p-4">
            <div
              role="group"
              aria-label="Payment amount"
              className="inline-flex rounded-lg border p-0.5"
            >
              {(
                [
                  { value: "full" as const, label: "Pay in full" },
                  { value: "installment" as const, label: "Pay an installment" },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectPayMode(option.value)}
                  aria-pressed={payMode === option.value}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    payMode === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {payMode === "full" ? (
              <p className="text-sm">
                Paying <strong>{formatNaira(delegate.balance)}</strong> now, in full.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount to pay now (₦)</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Pay any amount up to your {formatNaira(delegate.balance)} balance, online or by
                  transfer below.
                </p>
              </div>
            )}
          </div>

          {paystackEnabled ? (
            <Button onClick={payOnline} disabled={pending} className="w-full">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4" />
              )}
              Pay {formatNaira(Number(amount) || 0)} online
            </Button>
          ) : null}

          <div className="space-y-3 rounded-xl border p-5">
            <h2 className="text-sm font-medium">Or transfer and send your receipt</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Account name</dt>
                <dd className="text-right">{EVENT.bank.accountName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Account number</dt>
                <dd className="font-mono">{EVENT.bank.accountNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Bank</dt>
                <dd>{EVENT.bank.bankName}</dd>
              </div>
            </dl>

            {uploadsEnabled ? (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label>Receipt</Label>
                  <ImageUploader
                    kind="receipt"
                    images={receipts}
                    onChange={setReceipts}
                    max={1}
                    label="Attach receipt"
                    email={delegate.email}
                  />
                </div>

                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Anything we should know (optional)"
                />

                <Button onClick={sendReceipt} disabled={pending} className="w-full">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Send receipt for {formatNaira(Number(amount) || 0)}
                </Button>
              </div>
            ) : (
              <p className="border-t pt-3 text-sm text-muted-foreground">
                Send your receipt on WhatsApp to {EVENT.supportPhone}.
              </p>
            )}
          </div>
        </>
      ) : null}

      <Button variant="ghost" onClick={() => setDelegate(null)} className="w-full">
        Look up another registration
      </Button>
    </div>
  )
}
