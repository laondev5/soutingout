"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createStaff,
  deleteStaff,
  resetStaffPassword,
  setStaffActive,
  updateStaff,
} from "@/actions/admin.actions"
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Permission,
} from "@/lib/constants"

export type StaffRow = {
  id: string
  name: string
  email: string
  phone: string
  role: "sub_admin" | "pastor"
  permissions: Permission[]
  isActive: boolean
  maxDelegates: number
  delegateCount: number
  lastLoginAt: string | null
}

type Draft = {
  name: string
  email: string
  phone: string
  role: "sub_admin" | "pastor"
  maxDelegates: string
  permissions: Permission[]
}

/** Sentinel for "hand them to nobody", which is a real choice here. */
const UNASSIGN = "__unassign__"

function draftFrom(row: StaffRow): Draft {
  return {
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    maxDelegates: String(row.maxDelegates),
    permissions: [...row.permissions],
  }
}

export function StaffManager({
  role,
  staff,
  title,
  description,
}: {
  role: "sub_admin" | "pastor"
  staff: StaffRow[]
  title: string
  description: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [maxDelegates, setMaxDelegates] = useState("0")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [successorId, setSuccessorId] = useState("")

  const noun = role === "pastor" ? "pastor" : "sub-admin"

  function onCreate() {
    startTransition(async () => {
      const result = await createStaff({
        name,
        email,
        role,
        phone,
        maxDelegates: Number(maxDelegates) || 0,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      // Always surface the password: email may be unconfigured or may bounce,
      // and the super admin needs a way to hand it over regardless.
      toast.success(
        result.emailSent
          ? `${name} created and emailed their sign-in details.`
          : `${name} created. Temporary password: ${result.temporaryPassword}`,
        { duration: result.emailSent ? 5000 : 30000 }
      )

      setName("")
      setEmail("")
      setPhone("")
      setMaxDelegates("0")
      setShowForm(false)
      router.refresh()
    })
  }

  function onToggleActive(row: StaffRow) {
    startTransition(async () => {
      const result = await setStaffActive({ userId: row.id, isActive: !row.isActive })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(row.isActive ? `${row.name} deactivated.` : `${row.name} reactivated.`)
      router.refresh()
    })
  }

  function onResetPassword(row: StaffRow) {
    startTransition(async () => {
      const result = await resetStaffPassword({ userId: row.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.emailSent
          ? `New password emailed to ${row.email}.`
          : `New password for ${row.name}: ${result.temporaryPassword}`,
        { duration: result.emailSent ? 5000 : 30000 }
      )
    })
  }

  function startEditing(row: StaffRow) {
    setDeletingId(null)
    setEditingId(row.id)
    setDraft(draftFrom(row))
  }

  function startDeleting(row: StaffRow) {
    setEditingId(null)
    setDeletingId(row.id)
    setSuccessorId("")
  }

  function onSaveEdit(row: StaffRow) {
    if (!draft) return

    startTransition(async () => {
      const result = await updateStaff({
        userId: row.id,
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        role: draft.role,
        maxDelegates: Number(draft.maxDelegates) || 0,
        permissions: draft.permissions,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(
        draft.role === row.role
          ? `${draft.name} updated.`
          : `${draft.name} is now a ${ROLE_LABELS[draft.role].toLowerCase()}.`
      )
      setEditingId(null)
      setDraft(null)
      router.refresh()
    })
  }

  function onDelete(row: StaffRow) {
    startTransition(async () => {
      const result = await deleteStaff({
        userId: row.id,
        reassignToUserId: successorId === UNASSIGN ? undefined : successorId || undefined,
        unassign: successorId === UNASSIGN,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const moved =
        result.reassigned > 0
          ? `${result.reassigned} delegate${result.reassigned === 1 ? "" : "s"} moved over.`
          : result.unassigned > 0
            ? `${result.unassigned} delegate${result.unassigned === 1 ? "" : "s"} left unassigned.`
            : ""

      toast.success(`${row.name} deleted.${moved ? ` ${moved}` : ""}`)
      setDeletingId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => setShowForm((open) => !open)} variant={showForm ? "ghost" : "default"}>
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus className="size-4" /> Add {noun}
            </>
          )}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New {noun}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-name">Full name</Label>
                <Input
                  id="staff-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-phone">Phone (optional)</Label>
                <Input
                  id="staff-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-max">Max delegates (0 = unlimited)</Label>
                <Input
                  id="staff-max"
                  inputMode="numeric"
                  value={maxDelegates}
                  onChange={(event) => setMaxDelegates(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A temporary password is generated and emailed to them. They should change it after
              their first sign-in.
            </p>
            <Button onClick={onCreate} disabled={pending || !name || !email}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create account
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {staff.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No {role === "pastor" ? "pastors" : "sub-admins"} yet. Delegates cannot be
            auto-assigned until you add at least one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Delegates</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((row) => (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.delegateCount}
                      {row.maxDelegates > 0 ? (
                        <span className="text-muted-foreground"> / {row.maxDelegates}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastLoginAt
                        ? new Date(row.lastLoginAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {row.isActive ? (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-900">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={`Actions for ${row.name}`}
                          disabled={pending}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted disabled:opacity-50"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onClick={() =>
                              editingId === row.id ? setEditingId(null) : startEditing(row)
                            }
                          >
                            <Pencil className="size-4" /> Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onResetPassword(row)}>
                            <KeyRound className="size-4" /> Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onToggleActive(row)}>
                            {row.isActive ? (
                              <>
                                <UserX className="size-4" /> Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="size-4" /> Reactivate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              deletingId === row.id ? setDeletingId(null) : startDeleting(row)
                            }
                          >
                            <Trash2 className="size-4" /> Delete account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>

                  {editingId === row.id && draft ? (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="p-4">
                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-name-${row.id}`}>Full name</Label>
                              <Input
                                id={`edit-name-${row.id}`}
                                value={draft.name}
                                onChange={(event) =>
                                  setDraft({ ...draft, name: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-email-${row.id}`}>Email</Label>
                              <Input
                                id={`edit-email-${row.id}`}
                                type="email"
                                value={draft.email}
                                onChange={(event) =>
                                  setDraft({ ...draft, email: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-phone-${row.id}`}>Phone</Label>
                              <Input
                                id={`edit-phone-${row.id}`}
                                value={draft.phone}
                                onChange={(event) =>
                                  setDraft({ ...draft, phone: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`edit-max-${row.id}`}>
                                Max delegates (0 = unlimited)
                              </Label>
                              <Input
                                id={`edit-max-${row.id}`}
                                inputMode="numeric"
                                value={draft.maxDelegates}
                                onChange={(event) =>
                                  setDraft({ ...draft, maxDelegates: event.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5 sm:max-w-xs">
                            <Label htmlFor={`edit-role-${row.id}`}>Role</Label>
                            <select
                              id={`edit-role-${row.id}`}
                              value={draft.role}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  role: event.target.value as "sub_admin" | "pastor",
                                })
                              }
                              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                            >
                              <option value="sub_admin">{ROLE_LABELS.sub_admin}</option>
                              <option value="pastor">{ROLE_LABELS.pastor}</option>
                            </select>
                            {draft.role !== row.role ? (
                              <p className="text-xs text-amber-700">
                                They move to the {ROLE_LABELS[draft.role].toLowerCase()} list.
                                Anyone still assigned to them must be handed over first.
                              </p>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">Permissions</p>
                            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                              {PERMISSIONS.map((permission) => (
                                <label
                                  key={permission}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <Checkbox
                                    checked={draft.permissions.includes(permission)}
                                    onCheckedChange={(checked) =>
                                      setDraft({
                                        ...draft,
                                        permissions:
                                          checked === true
                                            ? [...draft.permissions, permission]
                                            : draft.permissions.filter((p) => p !== permission),
                                      })
                                    }
                                  />
                                  {PERMISSION_LABELS[permission]}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              disabled={pending || !draft.name || !draft.email}
                              onClick={() => onSaveEdit(row)}
                            >
                              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                              Save changes
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                setEditingId(null)
                                setDraft(null)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {deletingId === row.id ? (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="p-4">
                        <div className="space-y-3">
                          <p className="text-sm font-medium">
                            Delete {row.name}&rsquo;s account?
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            This cannot be undone. Their assignment and activity history stays in
                            the audit trail.
                          </p>

                          {row.delegateCount > 0 ? (
                            <div className="space-y-1.5 sm:max-w-sm">
                              <Label htmlFor={`successor-${row.id}`}>
                                Hand their {row.delegateCount} delegate
                                {row.delegateCount === 1 ? "" : "s"} to
                              </Label>
                              <select
                                id={`successor-${row.id}`}
                                value={successorId}
                                onChange={(event) => setSuccessorId(event.target.value)}
                                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                              >
                                <option value="">Choose…</option>
                                {staff
                                  .filter((other) => other.id !== row.id && other.isActive)
                                  .map((other) => (
                                    <option key={other.id} value={other.id}>
                                      {other.name} ({other.delegateCount})
                                    </option>
                                  ))}
                                <option value={UNASSIGN}>Nobody — leave them unassigned</option>
                              </select>
                              {successorId === UNASSIGN ? (
                                <p className="text-xs text-amber-700">
                                  They will show as Unassigned on the delegate list until someone
                                  picks them up.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={
                                pending || (row.delegateCount > 0 && !successorId)
                              }
                              onClick={() => onDelete(row)}
                            >
                              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                              Delete permanently
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setDeletingId(null)}
                            >
                              Keep account
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
