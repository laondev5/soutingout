import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { SiteHeader } from "@/components/SiteHeader"
import { SiteFooter } from "@/components/SiteFooter"
import { WhatsAppButton } from "@/components/WhatsAppButton"
import { PublicForm } from "@/components/forms/PublicForm"
import { getNavPages } from "@/lib/cms"
import { getPublicForm } from "@/lib/forms"

/** Forms the super admin builds. Answers land in the form's own collection. */
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: PageProps<"/forms/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const form = await getPublicForm(slug)

  if (!form) return {}

  return { title: form.name, description: form.description || undefined }
}

export default async function PublicFormPage({ params }: PageProps<"/forms/[slug]">) {
  const { slug } = await params

  const [form, navPages] = await Promise.all([getPublicForm(slug), getNavPages()])

  if (!form) {
    notFound()
  }

  return (
    <>
      <SiteHeader navPages={navPages} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          <PublicForm
            slug={form.slug}
            name={form.name}
            description={form.description}
            steps={form.steps.map((step) => ({
              id: step.id,
              name: step.name,
              description: step.description,
            }))}
            fields={form.fields}
            submitLabel={form.submitButtonLabel}
          />
        </div>
      </main>

      <SiteFooter />
      <WhatsAppButton />
    </>
  )
}
