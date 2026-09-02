"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, FileUp, Link2, Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  commitImport,
  previewSheetFile,
  previewSheetUrl,
  rollbackImport,
  type CommitResult,
  type PreviewResult,
} from "@/actions/import.actions"
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type SheetTable,
} from "@/lib/import-fields"
import { formatNaira } from "@/lib/constants"

const PAGE_SIZE = 25

type Stage = "idle" | "preview" | "done"

export type ImportBatchSummary = {
  id: string
  sourceType: string
  sourceLabel: string
  rowsImported: number
  rowsTotal: number
  createdAt: string
  actorName: string
  rolledBack: boolean
}

export function ImportClient({
  canForceAssign,
  subAdmins,
  history,
  ownName,
}: {
  canForceAssign: boolean
  subAdmins: { id: string; name: string }[]
  history: ImportBatchSummary[]
  ownName: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>("idle")
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState("")
  const [table, setTable] = useState<SheetTable | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [source, setSource] = useState<{ type: "upload" | "sheet_url"; label: string }>({
    type: "upload",
    label: "",
  })
  const [assignTo, setAssignTo] = useState("")
  const [result, setResult] = useState<CommitResult | null>(null)
  const [page, setPage] = useState(1)

  const pageRows = useMemo(() => {
    if (!preview) return []
    return preview.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  }, [preview, page])

  const pages = preview ? Math.max(1, Math.ceil(preview.rows.length / PAGE_SIZE)) : 1

  function handlePreview(run: () => Promise<Awaited<ReturnType<typeof previewSheetUrl>>>) {
    startTransition(async () => {
      const response = await run()

      if (!response.ok) {
        toast.error(response.error)
        return
      }

      setTable(response.table)
      setPreview(response.preview)
      setPage(1)
      setStage("preview")
    })
  }

  function fromUrl() {
    if (!url.trim()) {
      toast.error("Paste the Google Sheets link first.")
      return
    }
    setSource({ type: "sheet_url", label: url.trim() })
    handlePreview(() => previewSheetUrl({ url: url.trim() }))
  }

  function fromFile(file: File) {
    setSource({ type: "upload", label: file.name })

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? ""
      handlePreview(() => previewSheetFile({ base64 }))
    }
    reader.readAsDataURL(file)
  }

  /** Re-run the preview when a column mapping is corrected. */
  function remap(header: string, field: ImportField | "") {
    if (!preview || !table) return

    const mapping = { ...preview.mapping, [header]: field }

    startTransition(async () => {
      const response =
        source.type === "sheet_url"
          ? await previewSheetUrl({ url: source.label, mapping })
          : null

      // A re-uploaded file is not held in the browser, so for uploads the
      // mapping is applied locally against the table we already have.
      if (response?.ok) {
        setPreview(response.preview)
        setTable(response.table)
        return
      }

      setPreview({ ...preview, mapping })
      toast.info("Mapping updated. It is applied when you import.")
    })
  }

  function commit() {
    if (!table || !preview) return

    startTransition(async () => {
      const response = await commitImport({
        table,
        mapping: preview.mapping,
        assignToUserId: assignTo || null,
        sourceType: source.type,
        sourceLabel: source.label,
      })

      if (!response.ok) {
        toast.error(response.error)
        return
      }

      setResult(response)
      setStage("done")
      toast.success(`${response.imported} delegates imported.`)
      router.refresh()
    })
  }

  function undo(batchId: string) {
    startTransition(async () => {
      const response = await rollbackImport({ batchId })

      if (!response.ok) {
        toast.error(response.error)
        return
      }

      toast.success(`${response.removed} delegates removed.`)
      router.refresh()
    })
  }

  function reset() {
    setStage("idle")
    setTable(null)
    setPreview(null)
    setResult(null)
    setUrl("")
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import delegates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canForceAssign
            ? "Bring in the Google Form responses. Nothing is written until you review the preview."
            : `Imported delegates are assigned to you, ${ownName}.`}
        </p>
      </div>

      {stage === "idle" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border p-5">
            <div className="flex items-center gap-2 font-medium">
              <Link2 className="size-4" /> Paste a Sheet link
            </div>
            <p className="text-sm text-muted-foreground">
              Share the Sheet as &ldquo;Anyone with the link can view&rdquo;, then paste it here.
            </p>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              inputMode="url"
            />
            <Button onClick={fromUrl} disabled={pending} className="w-full sm:w-auto">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Read the Sheet
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border p-5">
            <div className="flex items-center gap-2 font-medium">
              <FileUp className="size-4" /> Upload a file
            </div>
            <p className="text-sm text-muted-foreground">
              Export the Sheet as CSV or XLSX and upload it. Useful for a private Sheet.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) fromFile(file)
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="w-full sm:w-auto"
            >
              Choose file
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "preview" && preview ? (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Rows", value: preview.counts.total },
              { label: "New", value: preview.counts.new },
              { label: "Duplicates", value: preview.counts.duplicate },
              { label: "Invalid", value: preview.counts.invalid },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <details className="rounded-xl border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Column mapping ({preview.headers.length} columns)
            </summary>
            <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
              {preview.headers.map((header) => (
                <div key={header} className="space-y-1">
                  <Label className="line-clamp-2 text-xs text-muted-foreground" title={header}>
                    {header}
                  </Label>
                  <select
                    value={preview.mapping[header] ?? ""}
                    onChange={(event) => remap(header, event.target.value as ImportField | "")}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="">— ignore —</option>
                    {IMPORT_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {FIELD_LABELS[field]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </details>

          {canForceAssign ? (
            <div className="space-y-1.5">
              <Label htmlFor="assign-to">Assign this batch to</Label>
              <select
                id="assign-to"
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
                className="h-9 w-full max-w-sm rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">Spread evenly (round-robin)</option>
                {subAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Accommodation</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Due</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {row.rowNumber}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{row.fullName || "—"}</span>
                      <p className="text-xs text-muted-foreground sm:hidden">{row.email}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{row.email}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {row.accommodation || "—"}
                      {!row.accommodationMatched && row.accommodation ? (
                        <AlertTriangle className="ml-1 inline size-3 text-amber-600" />
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right text-sm tabular-nums">
                      {row.total ? formatNaira(row.total) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.state === "new"
                            ? "default"
                            : row.state === "duplicate"
                              ? "secondary"
                              : "destructive"
                        }
                        title={row.reason}
                      >
                        {row.state}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={commit} disabled={pending || preview.counts.new === 0}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Import {preview.counts.new} delegates
            </Button>
            <Button variant="outline" onClick={reset} disabled={pending}>
              Start over
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "done" && result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border p-5">
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
            <div>
              <p className="font-medium">
                {result.imported} {result.imported === 1 ? "delegate" : "delegates"} imported
              </p>
              <p className="text-sm text-muted-foreground">
                {result.skipped} skipped. Everyone landed as pending and unpaid.
              </p>
            </div>
          </div>

          {result.issues.length > 0 ? (
            <details className="rounded-xl border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {result.issues.length} skipped rows
              </summary>
              <ul className="divide-y border-t text-sm">
                {result.issues.map((issue) => (
                  <li key={issue.rowNumber} className="flex justify-between gap-3 px-4 py-2">
                    <span className="truncate">
                      Row {issue.rowNumber} · {issue.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{issue.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Import another</Button>
            <Button variant="outline" onClick={() => undo(result.batchId)} disabled={pending}>
              <Undo2 className="size-4" /> Roll this batch back
            </Button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Recent imports</h2>
          <ul className="divide-y rounded-xl border">
            {history.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {batch.sourceLabel || batch.sourceType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {batch.rowsImported} of {batch.rowsTotal} rows · {batch.actorName} ·{" "}
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {batch.rolledBack ? (
                  <Badge variant="outline">Rolled back</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => undo(batch.id)}
                  >
                    <Undo2 className="size-3.5" /> Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
