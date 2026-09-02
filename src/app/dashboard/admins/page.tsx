import { requireSuperAdmin } from "@/lib/permissions"
import { listStaff } from "@/lib/staff"
import { StaffManager } from "@/components/dashboard/StaffManager"

export default async function AdminsPage() {
  await requireSuperAdmin()
  const staff = await listStaff("sub_admin")

  return (
    <StaffManager
      role="sub_admin"
      staff={staff}
      title="Sub-admins"
      description="New delegates are auto-assigned to whichever active sub-admin has the lightest load."
    />
  )
}
