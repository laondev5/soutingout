"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Loader2, Plus, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { CmsEditor, type EditorTarget } from "@/components/cms/CmsEditor"
import type { PricingRow } from "@/components/cms/BlockRenderer"
import {
  createPage,
  deletePage,
  discardDraft,
  duplicatePage,
  publishPage,
  publishSection,
  resetSection,
  savePageDraft,
  saveDraft,
  setPagePublished,
  updatePageMeta,
} from "@/actions/cms.actions"
import type { Section } from "@/lib/cms-blocks"

export type SlotOption = { slug: string; name: string; description: string; onDark?: boolean }

export type PageRow = {
  id: string
  slug: string
  title: string
  isPublished: boolean
  showInNav: boolean
  hasDraft: boolean
  publishedAt: string | null
  updatedAt: string | null
}

export type PageMeta = {
  id: string
  slug: string
  title: string
  navLabel: string
  showInNav: boolean
  navOrder: number
  seoDescription: string
  isPublished: boolean
}

/**
 * The page-content workspace: a rail of everything editable on the left, the
 * builder on the right.
 *
 * "Slots" are the fixed bands inside pages the app owns — the landing hero, a
 * registration step. "Pages" are whole pages the super admin creates, each at
 * its own address. Both are built out of the same sections and widgets, so the
 * builder itself does not care which it is looking at.
 */
export function CmsWorkspace({
  slots,
  pages,
  activeKind,
  activeId,
  sections,
  hasDraft,
  publishedAt,
  pageMeta,
  pricing,
}: {
  slots: SlotOption[]
  pages: PageRow[]
  activeKind: "slot" | "page"
  activeId: string
  sections: Section[]
  hasDraft: boolean
  publishedAt: string | null
  pageMeta: PageMeta | null
  pricing: PricingRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  function go(kind: "slot" | "page", id: string) {
    router.push(`/dashboard/cms?kind=${kind}&id=${encodeURIComponent(id)}`)
  }

  function onCreate() {
    const title = newTitle.trim()
    if (!title) return

    startTransition(async () => {
      const result = await createPage({ title })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`"${title}" created at /${result.slug}.`)
      setNewTitle("")
      setCreating(false)
      go("page", result.id)
    })
  }

  const slot = slots.find((entry) => entry.slug === activeId)

  const target: EditorTarget =
    activeKind === "page" && pageMeta
      ? {
          kind: "page",
          id: pageMeta.id,
          name: pageMeta.title,
          description: `Published at /${pageMeta.slug}`,
        }
      : {
          kind: "slot",
          id: activeId,
          name: slot?.name ?? "Page content",
          description: slot?.description,
          onDark: slot?.onDark,
        }

  const handlers =
    activeKind === "page" && pageMeta
      ? {
          saveDraft: (next: Section[]) => savePageDraft({ pageId: pageMeta.id, sections: next }),
          publish: (next: Section[]) => publishPage({ pageId: pageMeta.id, sections: next }),
        }
      : {
          saveDraft: (next: Section[]) => saveDraft({ slug: activeId, sections: next }),
          publish: (next: Section[]) => publishSection({ slug: activeId, sections: next }),
          discard: () => discardDraft({ slug: activeId }),
          reset: () => resetSection({ slug: activeId }),
        }

  return (
    <div className="space-y-3">
      {/* What is being edited. A dropdown rather than a rail: the list is
          short and read once, while the widgets beside the canvas are reached
          constantly and deserve the space. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Label htmlFor="cms-target" className="pl-1 text-xs uppercase tracking-wide text-muted-foreground">
          Editing
        </Label>

        <select
          id="cms-target"
          value={`${activeKind}:${activeId}`}
          onChange={(event) => {
            const [kind, ...rest] = event.target.value.split(":")
            go(kind === "page" ? "page" : "slot", rest.join(":"))
          }}
          className="h-9 min-w-56 max-w-full flex-1 rounded-md border bg-transparent px-2 text-sm sm:flex-none"
        >
          <optgroup label="Built into the app">
            {slots.map((entry) => (
              <option key={entry.slug} value={`slot:${entry.slug}`}>
                {entry.name}
              </option>
            ))}
          </optgroup>
          {pages.length > 0 ? (
            <optgroup label="Your pages">
              {pages.map((page) => (
                <option key={page.id} value={`page:${page.id}`}>
                  {page.title} — /{page.slug}
                  {page.isPublished ? "" : " (draft)"}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>

        {creating ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={newTitle}
              placeholder="New page title"
              aria-label="New page title"
              autoFocus
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCreate()
                if (event.key === "Escape") setCreating(false)
              }}
              className="h-9 max-w-64"
            />
            <Button size="sm" onClick={onCreate} disabled={pending || !newTitle.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New page
          </Button>
        )}
      </div>

      {activeKind === "page" && pageMeta ? (
        <PageSettings
          meta={pageMeta}
          open={showSettings}
          onToggle={() => setShowSettings((value) => !value)}
        />
      ) : null}

      <CmsEditor
        key={`${activeKind}:${activeId}`}
        target={target}
        initialSections={sections}
        hasDraft={hasDraft}
        publishedAt={publishedAt}
        pricing={pricing}
        handlers={handlers}
      />
    </div>
  )
}

function PageSettings({
  meta,
  open,
  onToggle,
}: {
  meta: PageMeta
  open: boolean
  onToggle: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    title: meta.title,
    slug: meta.slug,
    navLabel: meta.navLabel,
    showInNav: meta.showInNav,
    navOrder: String(meta.navOrder),
    seoDescription: meta.seoDescription,
  })

  function save() {
    startTransition(async () => {
      const result = await updatePageMeta({
        pageId: meta.id,
        title: draft.title,
        slug: draft.slug,
        navLabel: draft.navLabel,
        showInNav: draft.showInNav,
        navOrder: Number(draft.navOrder) || 0,
        seoDescription: draft.seoDescription,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Saved. This page lives at /${result.slug}.`)
      router.refresh()
    })
  }

  function togglePublished() {
    startTransition(async () => {
      const result = await setPagePublished({ pageId: meta.id, isPublished: !meta.isPublished })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(meta.isPublished ? "Page taken offline." : "Page is live.")
      router.refresh()
    })
  }

  function onDuplicate() {
    startTransition(async () => {
      const result = await duplicatePage({ pageId: meta.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Copied to /${result.slug}.`)
      router.push(`/dashboard/cms?kind=page&id=${result.id}`)
    })
  }

  function onDelete() {
    if (!window.confirm(`Delete "${meta.title}"? This cannot be undone.`)) return

    startTransition(async () => {
      const result = await deletePage({ pageId: meta.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Page deleted.")
      router.push("/dashboard/cms")
    })
  }

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={meta.isPublished ? "default" : "secondary"}>
            {meta.isPublished ? "Live" : "Not published"}
          </Badge>
          <code className="truncate text-xs text-muted-foreground">/{meta.slug}</code>
          {meta.isPublished ? (
            <Link
              href={`/${meta.slug}`}
              target="_blank"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open the live page"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <Settings2 className="size-4" /> Settings
          </Button>
          <Button variant="ghost" size="sm" onClick={togglePublished} disabled={pending}>
            {meta.isPublished ? "Take offline" : "Put live"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} disabled={pending}>
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={pending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-slug">Web address</Label>
            <Input
              id="page-slug"
              value={draft.slug}
              onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-nav">Menu label</Label>
            <Input
              id="page-nav"
              value={draft.navLabel}
              placeholder={draft.title}
              onChange={(event) => setDraft({ ...draft, navLabel: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-order">Menu position</Label>
            <Input
              id="page-order"
              inputMode="numeric"
              value={draft.navOrder}
              onChange={(event) => setDraft({ ...draft, navOrder: event.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="page-seo">Search description</Label>
            <Input
              id="page-seo"
              value={draft.seoDescription}
              placeholder="One sentence for search results."
              onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={draft.showInNav}
              onCheckedChange={(checked) => setDraft({ ...draft, showInNav: checked === true })}
            />
            Show this page in the site menu
          </label>

          <div className="sm:col-span-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
