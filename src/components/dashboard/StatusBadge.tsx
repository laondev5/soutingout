import { Badge } from "@/components/ui/badge"
import type { PastoralStatus, PaymentStatus, RegistrationStatus } from "@/lib/constants"

const REGISTRATION: Record<RegistrationStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-900 border-amber-200" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

const PAYMENT: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: "Unpaid", className: "bg-muted text-muted-foreground" },
  submitted: { label: "Awaiting review", className: "bg-blue-100 text-blue-900 border-blue-200" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-900 border-red-200" },
}

const PASTORAL: Record<PastoralStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-900 border-amber-200" },
  seen: { label: "Seen", className: "bg-emerald-100 text-emerald-900 border-emerald-200" },
}

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  const tone = REGISTRATION[status]
  return <Badge className={tone.className}>{tone.label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone = PAYMENT[status]
  return <Badge className={tone.className}>{tone.label}</Badge>
}

export function PastoralStatusBadge({ status }: { status: PastoralStatus }) {
  const tone = PASTORAL[status]
  return <Badge className={tone.className}>{tone.label}</Badge>
}
