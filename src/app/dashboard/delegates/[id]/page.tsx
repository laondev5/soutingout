import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireUser, can } from "@/lib/permissions"
import { getDelegateInScope } from "@/lib/delegates"
import { listAccommodationOptions } from "@/lib/accommodation"
import { connectDB } from "@/lib/mongoose"
import { AccommodationModel, AssignmentModel, PaymentModel, UserModel } from "@/lib/db-models"
import { formatNaira, type AdditionalServiceId } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge, PaymentStatusBadge } from "@/components/dashboard/StatusBadge"
import { DelegatePanel } from "@/components/dashboard/DelegatePanel"
import { DelegateDetailsCard } from "@/components/dashboard/DelegateDetailsCard"

export default async function DelegateDetailPage({
  params,
}: PageProps<"/dashboard/delegates/[id]">) {
  const { id } = await params
  const user = await requireUser()

  const delegate = await getDelegateInScope(user, id)
  if (!delegate) {
    notFound()
  }

  await connectDB()

  const [accommodation, payments, assignments, subAdmins, accommodations] = await Promise.all([
    delegate.accommodationId
      ? AccommodationModel.findById(delegate.accommodationId).select("name codePrefix").lean()
      : null,
    PaymentModel.find({ delegateId: delegate._id }).sort({ createdAt: -1 }).lean(),
    AssignmentModel.find({ delegateId: delegate._id }).sort({ createdAt: -1 }).limit(10).lean(),
    user.role === "super_admin"
      ? UserModel.find({ role: "sub_admin", isActive: true }).select("name email").lean()
      : [],
    can(user, "delegates.edit") ? listAccommodationOptions() : [],
  ])

  const ownerIds = [
    ...new Set(assignments.flatMap((a) => [a.fromUserId, a.toUserId]).filter(Boolean)),
  ]
  const owners = ownerIds.length
    ? await UserModel.find({ _id: { $in: ownerIds } }).select("name").lean()
    : []
  const ownerName = new Map(owners.map((o) => [String(o._id), o.name]))

  const balance = Math.max(0, (delegate.totalDue ?? 0) - (delegate.totalPaid ?? 0))

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/delegates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All delegates
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{delegate.fullName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={delegate.registrationStatus} />
            {delegate.lffId ? (
              <>
                <Badge variant="outline" className="font-mono">
                  {delegate.lffId}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {delegate.accommodationCode}
                </Badge>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Identifiers issue on payment confirmation
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DelegateDetailsCard
            delegateId={String(delegate._id)}
            canEdit={can(user, "delegates.edit")}
            isCancelled={delegate.registrationStatus === "cancelled"}
            accommodationName={accommodation?.name ?? "—"}
            registeredOn={new Date(delegate.createdAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            source={
              delegate.source === "google_sheet_import"
                ? "Google Sheet import"
                : delegate.source === "manual"
                  ? "Added by an admin"
                  : "Registration form"
            }
            delegate={{
              fullName: delegate.fullName,
              email: delegate.email,
              phoneNumber: delegate.phoneNumber,
              whatsappNumber: delegate.whatsappNumber,
              gender: delegate.gender ?? null,
              comingWith: delegate.comingWith,
              comments: delegate.comments ?? "",
              additionalServices: delegate.additionalServices as AdditionalServiceId[],
              companions: delegate.companions.map((companion) => ({
                fullName: companion.fullName,
                phone: companion.phone ?? "",
                whatsapp: companion.whatsapp ?? "",
                gender: companion.gender ?? null,
              })),
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {payments.map((payment) => (
                    <li
                      key={String(payment._id)}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium tabular-nums">
                          {formatNaira(payment.amount)}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {payment.provider === "paystack" ? "Paystack" : "Manual transfer"}
                          </span>
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {payment.reference}
                        </p>
                        {payment.receiptUrl ? (
                          <a
                            href={payment.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline"
                          >
                            View receipt
                          </a>
                        ) : null}
                      </div>
                      <PaymentStatusBadge status={payment.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {assignments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assignment history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {assignments.map((entry) => (
                    <li key={String(entry._id)} className="text-sm">
                      <span className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}
                        {" · "}
                      </span>
                      {entry.role === "pastor" ? "Pastor" : "Sub-admin"}{" "}
                      {entry.fromUserId ? (
                        <>
                          moved from{" "}
                          <strong>{ownerName.get(String(entry.fromUserId)) ?? "someone"}</strong> to{" "}
                        </>
                      ) : (
                        "assigned to "
                      )}
                      <strong>{ownerName.get(String(entry.toUserId)) ?? "someone"}</strong>
                      <span className="text-muted-foreground">
                        {entry.mode === "auto" ? " (automatic)" : ""}
                      </span>
                      {entry.reason ? (
                        <span className="block text-xs text-muted-foreground">
                          Reason: {entry.reason}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold tabular-nums">
                {balance > 0 ? formatNaira(balance) : "Paid"}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatNaira(delegate.totalPaid ?? 0)} paid of{" "}
                {formatNaira(delegate.totalDue ?? 0)}
              </p>
            </CardContent>
          </Card>

          <DelegatePanel
            delegateId={String(delegate._id)}
            currentAccommodationId={
              delegate.accommodationId ? String(delegate.accommodationId) : null
            }
            balance={balance}
            registrationStatus={delegate.registrationStatus}
            canConfirmPayments={can(user, "payments.confirm")}
            canEdit={can(user, "delegates.edit")}
            canAssign={can(user, "delegates.assign")}
            accommodations={accommodations.map((a) => ({ id: a.id, name: a.name }))}
            subAdmins={subAdmins.map((s) => ({ id: String(s._id), name: s.name }))}
            currentSubAdminId={
              delegate.assignedSubAdminId ? String(delegate.assignedSubAdminId) : null
            }
          />
        </div>
      </div>
    </div>
  )
}

