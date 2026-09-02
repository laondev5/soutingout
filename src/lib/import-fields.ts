/**
 * The client-safe half of the import pipeline: field names, labels and the
 * shape of a parsed sheet. Kept apart from `delegate-import.ts` because that
 * module is `server-only` and pulls in mongoose — importing a type from it
 * would drag the driver into the browser bundle.
 */

/** The Delegate fields a Sheet column can be mapped onto. */
export const IMPORT_FIELDS = [
  "timestamp",
  "fullName",
  "whatsappNumber",
  "phoneNumber",
  "email",
  "gender",
  "comingWith",
  "partnerFullName",
  "partnerPhone",
  "partnerWhatsapp",
  "partnerGender",
  "familyMember1",
  "familyMember2",
  "familyMember3",
  "accommodation",
  "comments",
  "additionalServices",
  "consent",
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export const FIELD_LABELS: Record<ImportField, string> = {
  timestamp: "Timestamp",
  fullName: "Full names",
  whatsappNumber: "WhatsApp number",
  phoneNumber: "Phone number",
  email: "Email",
  gender: "Gender",
  comingWith: "Who are you coming with",
  partnerFullName: "Spouse / friend — full names",
  partnerPhone: "Spouse / friend — phone",
  partnerWhatsapp: "Spouse / friend — WhatsApp",
  partnerGender: "Spouse / friend — gender",
  familyMember1: "Family member 1",
  familyMember2: "Family member 2",
  familyMember3: "Family member 3",
  accommodation: "Accommodation",
  comments: "Comments",
  additionalServices: "Additional services",
  consent: "Paid retreat consent",
}

export type SheetTable = { headers: string[]; rows: Record<string, string>[] }

export type RowIssue = { rowNumber: number; reason: string; name: string }
