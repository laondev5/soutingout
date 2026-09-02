import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { requireUser, can } from "@/lib/permissions"
import { listPayments, outstandingBalance, paymentCounts } from "@/lib/payment-list"
import { formatNaira, PAYMENT_STATUSES, type PaymentStatus } from "@/lib/constants"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmPaymentButton } from "@/components/dashboard/PaymentRowActions"
import { PaymentStatusBadge } from "@/components/dashboard/StatusBadge"
import { Pagination } from "@/components/dashboard/Pagination"
import { readPageSize } from "@/lib/list-params"
import { cn } from "@/lib/utils"

const TABS: { value: PaymentStatus | "all"; label: string }[] = [
  { value: "submitted", label: "Awaiting review" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
]

export default async function PaymentsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  const user = await requireUser()

  if (!can(user, "payments.view")) {
    redirect("/dashboard")
  }

  const params = await searchParams
  const statusParam = typeof params.status === "string" ? params.status : "submitted"
  const status = ((PAYMENT_STATUSES as readonly string[]).includes(statusParam)
    ? statusParam
    : statusParam === "all"
      ? "all"
      : "submitted") as PaymentStatus | "all"
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1
  const pageSize = readPageSize(params.perPage)

  const [result, counts, balance] = await Promise.all([
    listPayments(user, { status, page, pageSize }),
    paymentCounts(user),
    outstandingBalance(user),
  ])

  const canConfirm = can(user, "payments.confirm")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirming a payment mints the delegate&rsquo;s LFF ID and emails it to them.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Expected", value: formatNaira(balance.due), tone: "" },
          {
            label: "Received",
            value: formatNaira(balance.paid),
            tone: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40",
          },
          {
            label: "Outstanding",
            value: formatNaira(balance.outstanding),
            tone: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40",
          },
        ].map((stat) => (
          <div key={stat.label} className={cn("rounded-xl border p-4", stat.tone)}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/dashboard/payments?status=${tab.value}`}
            className={cn(
              buttonVariants({ variant: status === tab.value ? "default" : "outline", size: "sm" })
            )}
          >
            {tab.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[tab.value] ?? 0}</span>
          </Link>
        ))}
      </div>

      {result.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing here. Payments appear as delegates pay or upload receipts.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delegate</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Receipt</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {payment.delegate ? (
                      <Link
                        href={`/dashboard/delegates/${payment.delegate.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {payment.delegate.fullName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Deleted delegate</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {payment.delegate?.lffId ?? payment.delegate?.email}
                    </p>
                    <div className="mt-1 sm:hidden">
                      <PaymentStatusBadge status={payment.status} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-mono text-xs">{payment.reference}</span>
                    <p className="text-xs capitalize text-muted-foreground">
                      {payment.provider}
                      {payment.attempts > 0
                        ? ` · ${payment.attempts} check${payment.attempts === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatNaira(payment.amount)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PaymentStatusBadge status={payment.status} />
                    {payment.lastError ? (
                      <p
                        className="mt-1 max-w-40 truncate text-xs text-destructive"
                        title={payment.lastError}
                      >
                        {payment.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {payment.receiptUrl ? (
                      <a
                        href={payment.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canConfirm && payment.status !== "confirmed" ? (
                      <ConfirmPaymentButton paymentId={payment.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={result.perPage}
        label="payments"
      />
    </div>
  )
}
