import Link from "next/link"
import { Download } from "lucide-react"
import { can, requireUser } from "@/lib/permissions"
import { listDelegates } from "@/lib/delegates"
import { listAccommodationOptions } from "@/lib/accommodation"
import { formatNaira, REGISTRATION_STATUSES, type RegistrationStatus } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/dashboard/StatusBadge"
import { DelegateRowActions } from "@/components/dashboard/DelegateRowActions"
import { Pagination } from "@/components/dashboard/Pagination"
import { readPageSize } from "@/lib/list-params"

export default async function DelegatesPage({ searchParams }: PageProps<"/dashboard/delegates">) {
  const user = await requireUser()
  const params = await searchParams

  const search = typeof params.search === "string" ? params.search : ""
  const statusParam = typeof params.status === "string" ? params.status : "all"
  const status = (REGISTRATION_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as RegistrationStatus)
    : "all"
  const accommodationId = typeof params.accommodation === "string" ? params.accommodation : ""
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1
  const pageSize = readPageSize(params.perPage)

  const [result, accommodations] = await Promise.all([
    listDelegates(user, { search, status, accommodationId: accommodationId || undefined, page, pageSize }),
    listAccommodationOptions({ includeInactive: true }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Delegates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "delegate" : "delegates"}
            {status !== "all" ? ` · ${status}` : ""}
          </p>
        </div>

        {can(user, "delegates.export") ? (
          // A plain link, so the browser downloads it rather than the client
          // having to buffer a whole workbook in memory.
          <a
            href={`/api/export/delegates${status !== "all" ? `?status=${status}` : ""}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" /> Export XLSX
          </a>
        ) : null}
      </div>

      {/* A plain GET form keeps filters shareable as URLs and working without JS. */}
      <form className="flex flex-wrap items-center gap-2" action="/dashboard/delegates">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search name, email, phone, LFF ID…"
          className="h-9 w-full max-w-xs"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {REGISTRATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          name="accommodation"
          defaultValue={accommodationId}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="">All accommodation</option>
          {accommodations.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
        {search || status !== "all" || accommodationId ? (
          <Link
            href="/dashboard/delegates"
            className={buttonVariants({ size: "sm", variant: "ghost" })}
          >
            Clear
          </Link>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No delegates match this view.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delegate</TableHead>
                <TableHead>Identifiers</TableHead>
                <TableHead>Accommodation</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                {user.role === "super_admin" ? <TableHead>Sub-admin</TableHead> : null}
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((delegate) => (
                <TableRow key={delegate.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/delegates/${delegate.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {delegate.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{delegate.email}</p>
                    {delegate.partySize > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        Party of {delegate.partySize}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {delegate.lffId ? (
                      <div className="font-mono text-xs">
                        <div>{delegate.lffId}</div>
                        <div className="text-muted-foreground">{delegate.accommodationCode}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not issued</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {delegate.accommodationName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {delegate.balance > 0 ? (
                      <span className="font-medium text-amber-600">
                        {formatNaira(delegate.balance)}
                      </span>
                    ) : (
                      <span className="text-emerald-600">Paid</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={delegate.registrationStatus} />
                  </TableCell>
                  {user.role === "super_admin" ? (
                    <TableCell className="text-sm">
                      {delegate.assignedSubAdminName ?? (
                        <Badge variant="outline">Unassigned</Badge>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <DelegateRowActions
                      delegate={{
                        id: delegate.id,
                        fullName: delegate.fullName,
                        balance: delegate.balance,
                        isCancelled: delegate.registrationStatus === "cancelled",
                        hasIdentifiers: Boolean(delegate.lffId),
                      }}
                      canConfirmPayments={can(user, "payments.confirm")}
                      canEdit={can(user, "delegates.edit")}
                      canDelete={user.role === "super_admin"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={result.page}
        pages={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        label="delegates"
      />
    </div>
  )
}
