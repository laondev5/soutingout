import { Badge } from "@/components/ui/badge"
import type { PastoralStatus, PaymentStatus, RegistrationStatus } from "@/lib/constants"

/**
 * One tone per state, each with a dark-mode counterpart. Green means done,
 * amber means waiting on someone, blue means waiting on us, red means broken —
 * the same language everywhere a status appears.
 */
const TONES = {
  green:
    "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
  amber:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  blue: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900",
  red: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
  grey: "bg-muted text-muted-foreground border-transparent",
} as const

const REGISTRATION: Record<RegistrationStatus, { label: string; tone: keyof typeof TONES }> = {
  pending: { label: "Pending", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "grey" },
}

const PAYMENT: Record<PaymentStatus, { label: string; tone: keyof typeof TONES }> = {
  pending: { label: "Unpaid", tone: "grey" },
  submitted: { label: "Awaiting review", tone: "blue" },
  confirmed: { label: "Confirmed", tone: "green" },
  failed: { label: "Failed", tone: "red" },
}

const PASTORAL: Record<PastoralStatus, { label: string; tone: keyof typeof TONES }> = {
  pending: { label: "Pending", tone: "amber" },
  seen: { label: "Seen", tone: "green" },
}

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  const { label, tone } = REGISTRATION[status]
  return <Badge className={TONES[tone]}>{label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, tone } = PAYMENT[status]
  return <Badge className={TONES[tone]}>{label}</Badge>
}

export function PastoralStatusBadge({ status }: { status: PastoralStatus }) {
  const { label, tone } = PASTORAL[status]
  return <Badge className={TONES[tone]}>{label}</Badge>
}
