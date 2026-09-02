import { requireSuperAdmin } from "@/lib/permissions"
import { listStaff } from "@/lib/staff"
import { StaffManager } from "@/components/dashboard/StaffManager"

export default async function PastorsPage() {
  await requireSuperAdmin()
  const staff = await listStaff("pastor")

  return (
    <StaffManager
      role="pastor"
      staff={staff}
      title="Pastors"
      description="Pastors see only the delegates assigned to them, and mark each one pending or seen."
    />
  )
}
