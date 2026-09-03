import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireSuperAdmin } from "@/lib/permissions"
import { getForm, getFormFieldsFor, listSubmissions } from "@/lib/forms"
import { readPageSize } from "@/lib/list-params"
import { Pagination } from "@/components/dashboard/Pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

function display(value: unknown) {
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (value === null || value === undefined || value === "") return "—"
  return String(value)
}

export default async function FormResponsesPage({
  params,
  searchParams,
}: PageProps<"/dashboard/form-builder/[formId]/responses">) {
  await requireSuperAdmin()

  const { formId } = await params
  const query = await searchParams

  const form = await getForm(formId)
  if (!form || form.kind !== "standalone") {
    notFound()
  }

  const page = Number(typeof query.page === "string" ? query.page : "1") || 1
  const pageSize = readPageSize(query)

  const [fields, result] = await Promise.all([
    getFormFieldsFor(form.id),
    listSubmissions(form.collectionName, { page, pageSize }),
  ])

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/form-builder?form=${form.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to the form
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{form.name} — responses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total} response{result.total === 1 ? "" : "s"}, stored in{" "}
          <code className="text-xs">{form.collectionName}</code>.
        </p>
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No responses yet.{" "}
            {form.isPublished
              ? `Share /forms/${form.slug} to start collecting.`
              : "Put the form live to start collecting."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Received</TableHead>
                {fields.map((field) => (
                  <TableHead key={field.id} className="whitespace-nowrap">
                    {field.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.submittedAt
                      ? new Date(row.submittedAt).toLocaleString("en-NG", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TableCell>
                  {fields.map((field) => (
                    <TableCell key={field.id} className="max-w-64 text-sm">
                      {display(row.answers[field.key])}
                    </TableCell>
                  ))}
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
        pageSize={pageSize}
        label="responses"
      />
    </div>
  )
}
