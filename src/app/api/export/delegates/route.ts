import * as XLSX from "xlsx"
import {
  AccommodationModel,
  DelegateModel,
  PastoralSessionModel,
  UserModel,
} from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { can, delegateScope, requireUser } from "@/lib/permissions"
import { getFormFields } from "@/lib/form-config"
import { logActivity } from "@/lib/activity-log"
import { EVENT } from "@/lib/constants"
import { REGISTRATION_STATUSES, type RegistrationStatus } from "@/lib/constants"

export const dynamic = "force-dynamic"

/** Cap the export so one click cannot try to build a 200MB workbook. */
const MAX_ROWS = 20_000

/**
 * Download the caller's delegates as an XLSX workbook.
 *
 * Scoped exactly like every other delegate read: a sub-admin exports their own
 * list, a super admin exports everything. Custom form fields become extra
 * columns, so a question added in the form builder shows up here without any
 * code change.
 */
export async function GET(request: Request) {
  const user = await requireUser()

  if (!can(user, "delegates.export")) {
    return new Response("Not allowed.", { status: 403 })
  }

  await connectDB()

  const url = new URL(request.url)
  const statusParam = url.searchParams.get("status") ?? "all"
  const status = (REGISTRATION_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as RegistrationStatus)
    : null

  const filter: Record<string, unknown> = { ...delegateScope(user) }
  if (status) filter.registrationStatus = status

  const [delegates, accommodations, staff, fields] = await Promise.all([
    DelegateModel.find(filter).sort({ createdAt: -1 }).limit(MAX_ROWS).lean(),
    AccommodationModel.find({}).select("name").lean(),
    UserModel.find({}).select("name").lean(),
    getFormFields(),
  ])

  const accommodationNames = new Map(accommodations.map((a) => [String(a._id), a.name]))
  const staffNames = new Map(staff.map((s) => [String(s._id), s.name]))

  const sessions = await PastoralSessionModel.find({
    delegateId: { $in: delegates.map((d) => d._id) },
  })
    .select("delegateId status")
    .lean()

  const pastoralStatus = new Map(sessions.map((s) => [String(s.delegateId), s.status]))

  const customFields = fields.filter((field) => !field.isBuiltIn)

  const rows = delegates.map((d) => {
    const row: Record<string, string | number> = {
      "LFF ID": d.lffId ?? "",
      "Accommodation code": d.accommodationCode ?? "",
      "Full names": d.fullName,
      Email: d.email,
      "WhatsApp number": d.whatsappNumber ?? "",
      "Phone number": d.phoneNumber ?? "",
      Gender: d.gender ?? "",
      "Coming with": d.comingWith ?? "",
      Companions: (d.companions ?? []).map((c) => c.fullName).join("; "),
      "Party size": 1 + (d.companions ?? []).length,
      Accommodation: accommodationNames.get(String(d.accommodationId)) ?? "",
      "Additional services": (d.additionalServices ?? []).join(", "),
      Status: d.registrationStatus,
      "Total due": d.totalDue ?? 0,
      "Total paid": d.totalPaid ?? 0,
      Balance: Math.max(0, (d.totalDue ?? 0) - (d.totalPaid ?? 0)),
      "Sub-admin": staffNames.get(String(d.assignedSubAdminId)) ?? "",
      Pastor: staffNames.get(String(d.assignedPastorId)) ?? "",
      "Pastoral status": pastoralStatus.get(String(d._id)) ?? "pending",
      Comments: d.comments ?? "",
      Source: d.source ?? "",
      Registered: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
      Confirmed: d.confirmedAt ? new Date(d.confirmedAt).toISOString().slice(0, 10) : "",
    }

    // One column per custom question, so the export tracks the form builder.
    for (const field of customFields) {
      const answer = (d.customFields as Record<string, unknown> | undefined)?.[field.key]
      row[field.label] = Array.isArray(answer)
        ? answer.join(", ")
        : answer === undefined || answer === null
          ? ""
          : typeof answer === "boolean"
            ? answer
              ? "Yes"
              : "No"
            : String(answer)
    }

    return row
  })

  const sheet = XLSX.utils.json_to_sheet(rows)

  // Rough auto-width: the widest cell in each column, clamped so a long
  // comment does not produce a 400-character column.
  if (rows.length > 0) {
    sheet["!cols"] = Object.keys(rows[0]).map((key) => ({
      wch: Math.min(
        42,
        Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? "").length + 2))
      ),
    }))
  }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Delegates")

  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer

  await logActivity({
    actorUserId: user.id,
    action: "delegates.exported",
    entityType: "delegate",
    entityId: null,
    details: { rows: rows.length, status: status ?? "all" },
  })

  const filename = `${EVENT.tag}-delegates-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
