import { requireSuperAdmin } from "@/lib/permissions"
import { getFormFields } from "@/lib/form-config"
import { FormBuilder } from "@/components/cms/FormBuilder"

export const dynamic = "force-dynamic"

export default async function FormBuilderPage() {
  await requireSuperAdmin()
  const fields = await getFormFields()

  return <FormBuilder fields={fields} />
}
