import { requireSuperAdmin } from "@/lib/permissions"
import { getFormFields } from "@/lib/form-config"
import { getFormFieldsFor, listForms } from "@/lib/forms"
import { FormsWorkspace } from "@/components/cms/FormsWorkspace"

export const dynamic = "force-dynamic"

export default async function FormBuilderPage({
  searchParams,
}: PageProps<"/dashboard/form-builder">) {
  await requireSuperAdmin()

  const params = await searchParams
  const requested = typeof params.form === "string" ? params.form : ""

  const forms = await listForms()

  // A stale link to a deleted form falls back to registration rather than
  // erroring — there is always exactly one of those.
  const activeForm =
    forms.find((form) => form.id === requested) ??
    forms.find((form) => form.kind === "registration") ??
    forms[0]

  // The registration form's fields come through the cached reader the public
  // stepper uses; anything else is read straight off its own rows.
  const fields =
    activeForm.kind === "registration"
      ? await getFormFields()
      : await getFormFieldsFor(activeForm.id)

  return <FormsWorkspace forms={forms} activeForm={activeForm} fields={fields} />
}
