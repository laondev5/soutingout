/**
 * Single source of truth for everything the Google Form encoded.
 * Option strings are verbatim from the live form — do not reword them, the
 * Sheet import matches against these exact values.
 */

export const EVENT = {
  name: "October 2026 Kaduna Mega Sorting Out",
  shortName: "Kaduna Mega Sorting Out",
  tag: "KMS26",
  host: "Rev. PJA Olaiya",
  venue: "Alheri Prayer Village, Kaduna",
  startsOn: "2026-10-02",
  endsOn: "2026-10-04",
  dateLabel: "Friday, 2nd – Sunday, 4th October 2026",
  startTimeLabel: "Friday, 2nd October at 10:00 AM",
  supportPhone: "+234 811 253 9058",
  bank: {
    accountName: "LFF Youth Sorting Out",
    accountNumber: "0070277930",
    bankName: "Access Bank (formerly Diamond Bank)",
  },
} as const

/**
 * wa.me needs the number in international format with no plus or spaces.
 * Derived from `supportPhone` so there is only one number to keep correct.
 */
export const WHATSAPP_NUMBER = EVENT.supportPhone.replace(/[^\d]/g, "")

export const WHATSAPP_DEFAULT_MESSAGE = `Hello, I have a question about the ${EVENT.shortName} retreat.`

export function whatsappLink(message: string = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export const CURRENCY = "NGN"

/** Naira integers. Format for display only — never store formatted strings. */
export function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`
}

// ── Roles & permissions ──────────────────────────────────────────────

export const ROLES = ["super_admin", "sub_admin", "pastor"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  sub_admin: "Sub Admin",
  pastor: "Pastor",
}

export const PERMISSIONS = [
  "delegates.view",
  "delegates.edit",
  "delegates.assign",
  "delegates.import",
  "delegates.export",
  "payments.view",
  "payments.confirm",
  "accommodations.manage",
  "users.manage",
  "analytics.view",
  "activity.view",
] as const
export type Permission = (typeof PERMISSIONS)[number]

/** Granted to a sub-admin unless the super admin narrows it. */
export const DEFAULT_SUB_ADMIN_PERMISSIONS: Permission[] = [
  "delegates.view",
  "delegates.edit",
  "delegates.import",
  "delegates.export",
  "payments.view",
  "payments.confirm",
]

export const DEFAULT_PASTOR_PERMISSIONS: Permission[] = ["delegates.view"]

// ── Form vocabulary (verbatim) ───────────────────────────────────────

export const GENDERS = ["Male", "Female"] as const
export type Gender = (typeof GENDERS)[number]

export const COMING_WITH_OPTIONS = [
  "Just me",
  "My spouse",
  "A friend/ a sibling (same sex)",
  "My family of 3 (i.e me and 2 other family members)",
  "My family of 4 (i.e me and 3 other family members)",
] as const
export type ComingWith = (typeof COMING_WITH_OPTIONS)[number]

/** Which conditional step a "coming with" answer unlocks. */
export function companionStepFor(value: ComingWith | null | undefined) {
  switch (value) {
    case "My spouse":
    case "A friend/ a sibling (same sex)":
      return "partner" as const
    case "My family of 3 (i.e me and 2 other family members)":
    case "My family of 4 (i.e me and 3 other family members)":
      return "family" as const
    default:
      return "none" as const
  }
}

/** Family members to collect, excluding the registrant themselves. */
export function familyMemberCount(value: ComingWith | null | undefined) {
  if (value === "My family of 3 (i.e me and 2 other family members)") return 2
  if (value === "My family of 4 (i.e me and 3 other family members)") return 3
  return 0
}

export const ADDITIONAL_SERVICES = [
  {
    id: "aide",
    label: "Aide/ assistant (N10,000)",
    name: "Aide / assistant",
    price: 10_000,
  },
  {
    id: "internet",
    label: "Unlimited high speed internet services (N2,500 for the entire period)",
    name: "Unlimited high speed internet",
    price: 2_500,
  },
] as const
export type AdditionalServiceId = (typeof ADDITIONAL_SERVICES)[number]["id"]

export const PAID_RETREAT_CONSENT = "I understand that this is a paid retreat."

// ── Accommodation seed ───────────────────────────────────────────────
// `label` is the verbatim dropdown option, used by the Sheet import to map a
// row back to an Accommodation document. `codePrefix` drives the delegate's
// accommodation code, e.g. GEN-KMS26-0007.

/**
 * `per_person` multiplies by party size — the form is explicit that couples in
 * hostel or private accommodation each pay their own fee. `flat` charges the
 * unit once regardless of how many people occupy it, up to `capacityPerUnit`.
 */
export const PRICING_MODES = ["per_person", "flat"] as const
export type PricingMode = (typeof PRICING_MODES)[number]

export const ACCOMMODATION_SEED = [
  {
    codePrefix: "GEN",
    pricingMode: "per_person",
    name: "General hostels",
    label: "General hostels (Cost, N35,000 each for the duration)",
    description:
      "Shared hostel accommodation for the duration of the retreat. Covers registration, feeding and accommodation.",
    pricePerPerson: 35_000,
    capacityPerUnit: 1,
    totalBeds: 400,
  },
  {
    codePrefix: "PRIV",
    pricingMode: "per_person",
    name: "Private accommodation",
    label: "I have a private accommodation to stay at (N35,000 each)",
    description:
      "For participants who live in camp or already have somewhere to stay. Covers registration and feeding.",
    pricePerPerson: 35_000,
    capacityPerUnit: 1,
    totalBeds: 200,
  },
  {
    codePrefix: "PAIR",
    pricingMode: "per_person",
    name: "Pair me with someone",
    label: "Pair me with someone (Cost, N45,000 each.)",
    description: "Two participants to a room. The retreat team assigns your roommate.",
    pricePerPerson: 45_000,
    capacityPerUnit: 2,
    totalBeds: 80,
  },
  {
    codePrefix: "SOLO",
    pricingMode: "flat",
    name: "Stay alone in a room",
    label: "Stay alone (Cost, N75,000 for the duration)",
    description: "A room to yourself for the duration of the retreat.",
    pricePerPerson: 75_000,
    capacityPerUnit: 1,
    totalBeds: 40,
  },
  {
    codePrefix: "DUO",
    pricingMode: "flat",
    name: "I have someone to pair with",
    label:
      "I have someone to pair with (Cost, N90,000. Suitable for couples, 2 friends or siblings of same sex)",
    description:
      "A room for two people you are registering with — couples, or two friends or siblings of the same sex.",
    pricePerPerson: 90_000,
    capacityPerUnit: 2,
    totalBeds: 40,
  },
  {
    codePrefix: "VIP1",
    pricingMode: "flat",
    name: "VIP lodge 1",
    label: "VIP lodge 1 (Cost, N120,000. Suitable for stay alone or family of 3.)",
    description: "VIP lodge suitable for a solo stay or a family of 3.",
    pricePerPerson: 120_000,
    capacityPerUnit: 3,
    totalBeds: 24,
  },
  {
    codePrefix: "VIP2",
    pricingMode: "flat",
    name: "VIP lodge 2",
    label: "VIP lodge 2 (Cost, N150,000. Suitable for stay alone or family of 4.)",
    description: "VIP lodge suitable for a solo stay or a family of 4.",
    pricePerPerson: 150_000,
    capacityPerUnit: 4,
    totalBeds: 20,
  },
] as const

// ── Statuses ─────────────────────────────────────────────────────────

export const REGISTRATION_STATUSES = ["pending", "confirmed", "cancelled"] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

export const PAYMENT_STATUSES = ["pending", "submitted", "confirmed", "failed"] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PASTORAL_STATUSES = ["pending", "seen"] as const
export type PastoralStatus = (typeof PASTORAL_STATUSES)[number]

/** Reconciliation backoff in minutes, indexed by attempt count. */
export const PAYMENT_RETRY_SCHEDULE_MINUTES = [1, 2, 5, 15, 30, 60, 120, 240] as const
export const MAX_PAYMENT_ATTEMPTS = PAYMENT_RETRY_SCHEDULE_MINUTES.length
