"use server"

import { revalidatePath } from "next/cache"
import mongoose from "mongoose"
import { BookingModel, DelegateModel, ImportBatchModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, requireUser } from "@/lib/permissions"
import { assignDelegate, autoAssignNewDelegate } from "@/lib/assignment"
import { quote } from "@/lib/pricing"
import { logActivity } from "@/lib/activity-log"
import {
  accommodationMatcher,
  companionsFor,
  fetchSheet,
  guessMapping,
  normalizeRow,
  parseWorkbook,
  validateRow,
  type ImportField,
  type NormalizedRow,
  type RowIssue,
  type SheetTable,
} from "@/lib/delegate-import"

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** How many rows one commit will write, so a huge paste cannot run forever. */
const MAX_ROWS = 2000

export type PreviewRow = {
  rowNumber: number
  fullName: string
  email: string
  phone: string
  comingWith: string
  accommodation: string
  accommodationMatched: boolean
  total: number
  state: "new" | "duplicate" | "invalid"
  reason?: string
}

export type PreviewResult = {
  headers: string[]
  mapping: Record<string, ImportField | "">
  rows: PreviewRow[]
  counts: { total: number; new: number; duplicate: number; invalid: number }
}

async function requireImporter() {
  const user = await requireUser()

  if (!can(user, "delegates.import")) {
    return { ok: false as const, error: "You do not have permission to import delegates." }
  }

  return { ok: true as const, user }
}

async function buildPreview(
  table: SheetTable,
  mappingOverride?: Record<string, ImportField | "">
): Promise<PreviewResult> {
  await connectDB()

  const mapping = mappingOverride ?? guessMapping(table.headers)
  const match = await accommodationMatcher()

  const rows = table.rows.slice(0, MAX_ROWS)
  const normalized = rows.map((raw, index) => normalizeRow(raw, mapping, index + 2))

  // One query for every email in the file rather than one per row.
  const emails = normalized.map((row) => row.email).filter(Boolean)
  const phones = normalized.map((row) => row.whatsappNumber || row.phoneNumber).filter(Boolean)

  const existing = await DelegateModel.find({
    $or: [{ email: { $in: emails } }, { whatsappNumber: { $in: phones } }],
  })
    .select("email whatsappNumber")
    .lean()

  const takenEmails = new Set(existing.map((row) => row.email?.toLowerCase()))
  const takenPhones = new Set(existing.map((row) => row.whatsappNumber))

  // Duplicates inside the file itself count too, so importing a sheet with a
  // repeated row does not create the same person twice.
  const seenEmails = new Set<string>()

  const preview: PreviewRow[] = normalized.map((row) => {
    const accommodation = match(row.accommodationLabel)
    const invalidReason = validateRow(row)

    const priced = accommodation
      ? quote({
          accommodation: {
            name: accommodation.name,
            pricePerPerson: accommodation.pricePerPerson,
            pricingMode: (accommodation.pricingMode ?? "per_person") as "per_person" | "flat",
            capacityPerUnit: accommodation.capacityPerUnit ?? 1,
            isFree: accommodation.isFree ?? false,
          },
          comingWith: row.comingWith,
          additionalServices: row.additionalServices,
        })
      : null

    let state: PreviewRow["state"] = "new"
    let reason: string | undefined

    if (invalidReason) {
      state = "invalid"
      reason = invalidReason
    } else if (
      takenEmails.has(row.email) ||
      seenEmails.has(row.email) ||
      (row.whatsappNumber && takenPhones.has(row.whatsappNumber))
    ) {
      state = "duplicate"
      reason = "Already registered"
    } else {
      seenEmails.add(row.email)
    }

    return {
      rowNumber: row.rowNumber,
      fullName: row.fullName,
      email: row.email,
      phone: row.whatsappNumber || row.phoneNumber,
      comingWith: row.comingWith,
      accommodation: accommodation?.name ?? row.accommodationLabel,
      accommodationMatched: Boolean(accommodation),
      total: priced?.total ?? 0,
      state,
      reason,
    }
  })

  return {
    headers: table.headers,
    mapping,
    rows: preview,
    counts: {
      total: preview.length,
      new: preview.filter((row) => row.state === "new").length,
      duplicate: preview.filter((row) => row.state === "duplicate").length,
      invalid: preview.filter((row) => row.state === "invalid").length,
    },
  }
}

/** Preview a pasted Google Sheets link. Nothing is written. */
export async function previewSheetUrl(input: {
  url: string
  mapping?: Record<string, ImportField | "">
}): Promise<ActionResult<{ preview: PreviewResult; table: SheetTable }>> {
  const guard = await requireImporter()
  if (!guard.ok) return guard

  let table: SheetTable
  try {
    table = await fetchSheet(input.url)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not read that Sheet." }
  }

  if (table.rows.length === 0) {
    return { ok: false, error: "That Sheet has no rows." }
  }

  return { ok: true, preview: await buildPreview(table, input.mapping), table }
}

/** Preview an uploaded CSV/XLSX, sent as base64 from the browser. */
export async function previewSheetFile(input: {
  base64: string
  mapping?: Record<string, ImportField | "">
}): Promise<ActionResult<{ preview: PreviewResult; table: SheetTable }>> {
  const guard = await requireImporter()
  if (!guard.ok) return guard

  let table: SheetTable
  try {
    const buffer = Buffer.from(input.base64, "base64")
    table = parseWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
  } catch {
    return { ok: false, error: "That file could not be read. Export the Sheet as CSV or XLSX." }
  }

  if (table.rows.length === 0) {
    return { ok: false, error: "That file has no rows." }
  }

  return { ok: true, preview: await buildPreview(table, input.mapping), table }
}

export type CommitResult = {
  batchId: string
  imported: number
  skipped: number
  issues: RowIssue[]
}

/**
 * Write the rows that previewed as new.
 *
 * Imports always land as `pending` with no Payment row — importing records
 * that someone registered, never that they paid. Assignment runs through the
 * same path as a stepper registration, except that a sub-admin's own import
 * is assigned to themselves rather than round-robined away.
 */
export async function commitImport(input: {
  table: SheetTable
  mapping: Record<string, ImportField | "">
  assignToUserId?: string | null
  sourceType?: "upload" | "sheet_url"
  sourceLabel?: string
}): Promise<ActionResult<CommitResult>> {
  const guard = await requireImporter()
  if (!guard.ok) return guard

  const { user } = guard
  await connectDB()

  const match = await accommodationMatcher()
  const batch = await ImportBatchModel.create({
    actorUserId: new mongoose.Types.ObjectId(user.id),
    sourceType: input.sourceType ?? "upload",
    sourceLabel: input.sourceLabel ?? "",
    mapping: input.mapping,
    rowsTotal: input.table.rows.length,
  })
  const batchId = String(batch._id)

  const rows = input.table.rows.slice(0, MAX_ROWS)
  const issues: RowIssue[] = []
  let imported = 0
  let skipped = 0

  // A sub-admin importing takes ownership of what they import; a super admin
  // may force the whole batch onto one person, or leave it to round-robin.
  const forcedAssignee =
    user.role === "sub_admin" ? user.id : (input.assignToUserId || null)

  for (const raw of rows) {
    const rowNumber = rows.indexOf(raw) + 2
    const row: NormalizedRow = normalizeRow(raw, input.mapping, rowNumber)

    const invalid = validateRow(row)
    if (invalid) {
      skipped += 1
      issues.push({ rowNumber, reason: invalid, name: row.fullName || row.email || "—" })
      continue
    }

    const clash = await DelegateModel.findOne({
      $or: [
        { email: row.email },
        ...(row.whatsappNumber ? [{ whatsappNumber: row.whatsappNumber }] : []),
      ],
    }).select("_id")

    if (clash) {
      skipped += 1
      issues.push({ rowNumber, reason: "Already registered", name: row.fullName })
      continue
    }

    const accommodation = match(row.accommodationLabel)

    if (!accommodation) {
      skipped += 1
      issues.push({
        rowNumber,
        reason: `Unknown accommodation: ${row.accommodationLabel || "(blank)"}`,
        name: row.fullName,
      })
      continue
    }

    const priced = quote({
      accommodation: {
        name: accommodation.name,
        pricePerPerson: accommodation.pricePerPerson,
        pricingMode: (accommodation.pricingMode ?? "per_person") as "per_person" | "flat",
        capacityPerUnit: accommodation.capacityPerUnit ?? 1,
        isFree: accommodation.isFree ?? false,
      },
      comingWith: row.comingWith,
      additionalServices: row.additionalServices,
    })

    const delegate = await DelegateModel.create({
      fullName: row.fullName,
      whatsappNumber: row.whatsappNumber,
      phoneNumber: row.phoneNumber || row.whatsappNumber,
      email: row.email,
      gender: row.gender || undefined,
      comingWith: row.comingWith,
      companions: companionsFor(row),
      accommodationId: accommodation._id,
      comments: row.comments,
      additionalServices: row.additionalServices,
      paidRetreatConsent: true,
      registrationStatus: "pending",
      totalDue: priced.total,
      totalPaid: 0,
      source: "google_sheet_import",
      importBatchId: batchId,
    })

    await BookingModel.create({
      delegateId: delegate._id,
      accommodationId: accommodation._id,
      beds: priced.bedsRequired,
      unitPrice: accommodation.pricePerPerson,
      amount: priced.accommodationTotal,
      status: "held",
    })

    if (forcedAssignee) {
      await assignDelegate({
        delegateId: delegate._id,
        role: "sub_admin",
        toUserId: forcedAssignee,
        reason: "Google Sheet import",
        actorUserId: user.id,
        // One email per delegate would flood the importer's inbox; the batch
        // summary on screen is the notification for an import.
        notify: false,
      })
      await assignDelegate({ delegateId: delegate._id, role: "pastor", notify: false })
    } else {
      await autoAssignNewDelegate(delegate._id, { notify: false })
    }

    imported += 1
  }

  await ImportBatchModel.updateOne(
    { _id: batch._id },
    {
      $set: {
        rowsImported: imported,
        rowsDuplicate: issues.filter((issue) => issue.reason === "Already registered").length,
        rowsInvalid: skipped - issues.filter((i) => i.reason === "Already registered").length,
        assignToUserId: forcedAssignee ? new mongoose.Types.ObjectId(forcedAssignee) : null,
      },
    }
  )

  await logActivity({
    actorUserId: user.id,
    action: "delegates.imported",
    entityType: "import",
    entityId: batchId,
    details: { imported, skipped, assignedTo: forcedAssignee, rows: rows.length },
  })

  revalidatePath("/dashboard/delegates")
  revalidatePath("/dashboard/import")

  return { ok: true, batchId, imported, skipped, issues: issues.slice(0, 100) }
}

/** Undo a batch: delete the delegates it created and release their beds. */
export async function rollbackImport(input: { batchId: string }): Promise<ActionResult<{ removed: number }>> {
  const guard = await requireImporter()
  if (!guard.ok) return guard

  await connectDB()

  const delegates = await DelegateModel.find({
    importBatchId: input.batchId,
    // Never undo someone who has already paid — that is real money and a real
    // LFF ID, so the batch is only reversible while it is untouched.
    registrationStatus: "pending",
    totalPaid: 0,
  }).select("_id")

  const ids = delegates.map((row) => row._id)

  if (ids.length === 0) {
    return { ok: false, error: "Nothing in that batch can be rolled back." }
  }

  await BookingModel.deleteMany({ delegateId: { $in: ids }, status: "held" })
  await DelegateModel.deleteMany({ _id: { $in: ids } })

  await ImportBatchModel.updateOne(
    { _id: input.batchId },
    { $set: { rolledBackAt: new Date() } }
  )

  await logActivity({
    actorUserId: guard.user.id,
    action: "delegates.import_rolled_back",
    entityType: "import",
    entityId: input.batchId,
    details: { removed: ids.length },
  })

  revalidatePath("/dashboard/delegates")
  revalidatePath("/dashboard/import")

  return { ok: true, removed: ids.length }
}
