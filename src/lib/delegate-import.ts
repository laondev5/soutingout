import "server-only"
import * as XLSX from "xlsx"
import { AccommodationModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  familyMemberCount,
  companionStepFor,
  type AdditionalServiceId,
  type ComingWith,
} from "@/lib/constants"

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

/**
 * Keyword sets used to guess which column is which. The Google Form's headers
 * are the questions verbatim, so these match on distinctive fragments rather
 * than the whole string — a question can be reworded slightly and still map.
 * Order matters: the first field whose keywords all appear wins.
 */
const MATCHERS: { field: ImportField; all: string[][] }[] = [
  { field: "timestamp", all: [["timestamp"]] },
  { field: "partnerFullName", all: [["spouse", "name"], ["friend", "name"], ["sibling", "name"]] },
  { field: "partnerPhone", all: [["spouse", "phone"], ["friend", "phone"], ["sibling", "phone"]] },
  {
    field: "partnerWhatsapp",
    all: [["spouse", "whatsapp"], ["friend", "whatsapp"], ["sibling", "whatsapp"]],
  },
  {
    field: "partnerGender",
    all: [["spouse", "gender"], ["friend", "gender"], ["sibling", "gender"]],
  },
  { field: "familyMember1", all: [["family member 1"], ["member 1"]] },
  { field: "familyMember2", all: [["family member 2"], ["member 2"]] },
  { field: "familyMember3", all: [["family member 3"], ["member 3"]] },
  { field: "comingWith", all: [["coming with"], ["who are you"]] },
  { field: "accommodation", all: [["accommodation"], ["lodge"], ["hostel"]] },
  { field: "additionalServices", all: [["additional service"], ["extra service"], ["aide"]] },
  { field: "comments", all: [["comment"], ["feeding"]] },
  { field: "consent", all: [["paid retreat"], ["understand"]] },
  { field: "whatsappNumber", all: [["whatsapp"]] },
  { field: "phoneNumber", all: [["phone"]] },
  { field: "email", all: [["email"], ["e-mail"]] },
  { field: "gender", all: [["gender"], ["sex"]] },
  { field: "fullName", all: [["full name"], ["name"]] },
]

export function guessMapping(headers: string[]): Record<string, ImportField | ""> {
  const mapping: Record<string, ImportField | ""> = {}
  const claimed = new Set<ImportField>()

  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    let match: ImportField | "" = ""

    for (const matcher of MATCHERS) {
      if (claimed.has(matcher.field)) continue

      const hit = matcher.all.some((keywords) =>
        keywords.every((keyword) => normalized.includes(keyword))
      )

      if (hit) {
        match = matcher.field
        claimed.add(matcher.field)
        break
      }
    }

    mapping[header] = match
  }

  return mapping
}

// ── Reading a sheet ──────────────────────────────────────────────────

export type SheetTable = { headers: string[]; rows: Record<string, string>[] }

export function parseWorkbook(buffer: ArrayBuffer): SheetTable {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return { headers: [], rows: [] }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  })

  const headers = Object.keys(rows[0] ?? {})

  return {
    headers,
    rows: rows.map((row) => {
      const clean: Record<string, string> = {}
      for (const key of headers) {
        clean[key] = String(row[key] ?? "").trim()
      }
      return clean
    }),
  }
}

/**
 * Turn any Google Sheets link into its CSV export URL. Works for a Sheet
 * shared as "anyone with the link can view", which avoids needing a service
 * account or an OAuth flow just to read responses.
 */
export function sheetCsvUrl(input: string): string | null {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return null

  const id = match[1]
  const gid = input.match(/[#&?]gid=([0-9]+)/)?.[1] ?? "0"

  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

export async function fetchSheet(url: string): Promise<SheetTable> {
  const csvUrl = sheetCsvUrl(url)

  if (!csvUrl) {
    throw new Error("That does not look like a Google Sheets link.")
  }

  const response = await fetch(csvUrl, { redirect: "follow", cache: "no-store" })

  if (!response.ok) {
    throw new Error(
      "Could not read that Sheet. Share it as “Anyone with the link can view” and try again."
    )
  }

  const text = await response.text()

  // A Sheet that is not shared publicly answers with an HTML sign-in page
  // rather than an error status, so the content has to be sniffed.
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      "That Sheet is private. Share it as “Anyone with the link can view” and try again."
    )
  }

  return parseWorkbook(new TextEncoder().encode(text).buffer as ArrayBuffer)
}

// ── Normalising one row ──────────────────────────────────────────────

export type NormalizedRow = {
  rowNumber: number
  fullName: string
  email: string
  whatsappNumber: string
  phoneNumber: string
  gender: "Male" | "Female" | ""
  comingWith: ComingWith
  partnerFullName: string
  partnerPhone: string
  partnerWhatsapp: string
  partnerGender: "Male" | "Female" | ""
  familyMembers: string[]
  accommodationLabel: string
  comments: string
  additionalServices: AdditionalServiceId[]
}

export type RowIssue = { rowNumber: number; reason: string; name: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

/** Nigerian numbers arrive as 0803…, +234803… and 234803…; store one shape. */
export function normalizePhone(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (digits.length >= 13 && digits.startsWith("234")) return `0${digits.slice(3)}`
  return digits
}

function matchComingWith(value: string): ComingWith {
  const normalized = value.toLowerCase().trim()

  const exact = COMING_WITH_OPTIONS.find((option) => option.toLowerCase() === normalized)
  if (exact) return exact

  if (normalized.includes("family of 4")) return COMING_WITH_OPTIONS[4]
  if (normalized.includes("family of 3")) return COMING_WITH_OPTIONS[3]
  if (normalized.includes("friend") || normalized.includes("sibling")) return COMING_WITH_OPTIONS[2]
  if (normalized.includes("spouse")) return COMING_WITH_OPTIONS[1]

  return COMING_WITH_OPTIONS[0]
}

function matchGender(value: string): "Male" | "Female" | "" {
  const normalized = value.toLowerCase().trim()
  if (normalized.startsWith("m")) return "Male"
  if (normalized.startsWith("f")) return "Female"
  return ""
}

function matchServices(value: string): AdditionalServiceId[] {
  const normalized = value.toLowerCase()
  return ADDITIONAL_SERVICES.filter((service) => {
    if (service.id === "aide") return normalized.includes("aide") || normalized.includes("assistant")
    return normalized.includes("internet")
  }).map((service) => service.id)
}

export function normalizeRow(
  raw: Record<string, string>,
  mapping: Record<string, ImportField | "">,
  rowNumber: number
): NormalizedRow {
  const value = (field: ImportField) => {
    const header = Object.keys(mapping).find((key) => mapping[key] === field)
    return header ? (raw[header] ?? "").trim() : ""
  }

  return {
    rowNumber,
    fullName: value("fullName"),
    email: normalizeEmail(value("email")),
    whatsappNumber: normalizePhone(value("whatsappNumber")),
    phoneNumber: normalizePhone(value("phoneNumber")),
    gender: matchGender(value("gender")),
    comingWith: matchComingWith(value("comingWith")),
    partnerFullName: value("partnerFullName"),
    partnerPhone: normalizePhone(value("partnerPhone")),
    partnerWhatsapp: normalizePhone(value("partnerWhatsapp")),
    partnerGender: matchGender(value("partnerGender")),
    familyMembers: [value("familyMember1"), value("familyMember2"), value("familyMember3")].filter(
      Boolean
    ),
    accommodationLabel: value("accommodation"),
    comments: value("comments"),
    additionalServices: matchServices(value("additionalServices")),
  }
}

/** Why a row cannot be imported, or null if it can. */
export function validateRow(row: NormalizedRow): string | null {
  if (!row.fullName) return "No name"
  if (!row.email) return "No email address"
  if (!EMAIL.test(row.email)) return `Invalid email: ${row.email}`
  if (!row.whatsappNumber && !row.phoneNumber) return "No phone or WhatsApp number"
  return null
}

/**
 * Map a Sheet's accommodation answer back to an Accommodation document. The
 * form's dropdown text is stored on each record as `formLabel`, so exact
 * matches are cheap; the fallbacks cover a label that has since been edited.
 */
export async function accommodationMatcher() {
  await connectDB()

  const accommodations = await AccommodationModel.find({})
    .select("_id name codePrefix formLabel pricePerPerson pricingMode capacityPerUnit isFree")
    .lean()

  const byLabel = new Map<string, (typeof accommodations)[number]>()

  for (const accommodation of accommodations) {
    if (accommodation.formLabel) byLabel.set(accommodation.formLabel.toLowerCase().trim(), accommodation)
    byLabel.set(accommodation.name.toLowerCase().trim(), accommodation)
  }

  return function match(label: string) {
    const normalized = label.toLowerCase().trim()
    if (!normalized) return null

    const exact = byLabel.get(normalized)
    if (exact) return exact

    // Longest name that appears in the answer wins, so "VIP lodge 2" is not
    // beaten by a shorter tier whose name is a substring of it.
    const candidates = accommodations
      .filter((a) => normalized.includes(a.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)

    return candidates[0] ?? null
  }
}

/** Rebuild the companion subdocuments the same way the stepper does. */
export function companionsFor(row: NormalizedRow) {
  const branch = companionStepFor(row.comingWith)

  if (branch === "partner" && row.partnerFullName) {
    return [
      {
        kind: row.comingWith === "My spouse" ? ("spouse" as const) : ("friend_sibling" as const),
        fullName: row.partnerFullName,
        phone: row.partnerPhone,
        whatsapp: row.partnerWhatsapp,
        gender: row.partnerGender || undefined,
      },
    ]
  }

  if (branch === "family") {
    return row.familyMembers
      .slice(0, familyMemberCount(row.comingWith))
      .map((fullName) => ({ kind: "family_member" as const, fullName }))
  }

  return []
}
