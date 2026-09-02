"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createStaff, resetStaffPassword, setStaffActive } from "@/actions/admin.actions"

export type StaffRow = {
  id: string
  name: string
  email: string
  phone?: string
  isActive: boolean
  maxDelegates: number
  delegateCount: number
  lastLoginAt: string | null
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
              <Plus className="size-4" /> Add {role === "pastor" ? "pastor" : "sub-admin"}
            </>
          )}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              New {role === "pastor" ? "pastor" : "sub-admin"}
            </CardTitle>
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
                <TableRow key={row.id}>
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
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onResetPassword(row)}
                      >
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onToggleActive(row)}
                      >
                        {row.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
