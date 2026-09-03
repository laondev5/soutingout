"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ImageUploader } from "@/components/ImageUploader"
import { BLOCK_SPECS, type Block, type PropSpec } from "@/lib/cms-blocks"

/**
 * The right-hand inspector. Each widget declares which property editors it
 * needs in `BLOCK_SPECS`, so this component renders whatever the spec says
 * rather than knowing anything about individual widgets.
 */
export function PropertyPanel({
  block,
  onChange,
}: {
  block: Block
  onChange: (props: Record<string, unknown>) => void
}) {
  const spec = BLOCK_SPECS[block.type]

  function set(key: string, value: unknown) {
    onChange({ ...block.props, [key]: value })
  }

  if (spec.props.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {spec.name} has nothing to configure.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {spec.props.map((prop) => (
        <PropertyField
          key={prop.key}
          prop={prop}
          value={block.props?.[prop.key]}
          onChange={(value) => set(prop.key, value)}
        />
      ))}
    </div>
  )
}

function PropertyField({
  prop,
  value,
  onChange,
}: {
  prop: PropSpec
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = `prop-${prop.key}`

  const help = prop.help ? (
    <p className="text-xs leading-relaxed text-muted-foreground">{prop.help}</p>
  ) : null

  switch (prop.kind) {
    case "boolean":
      return (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <span>
            {prop.label}
            {help}
          </span>
        </label>
      )

    case "textarea":
    case "richtext":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{prop.label}</Label>
          <Textarea
            id={id}
            rows={prop.kind === "richtext" ? 5 : 3}
            value={String(value ?? "")}
            placeholder={prop.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
        </div>
      )

    case "select":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{prop.label}</Label>
          <select
            id={id}
            value={String(value ?? prop.options?.[0]?.value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
          >
            {prop.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      )

    case "number":
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{prop.label}</Label>
          <Input
            id={id}
            type="number"
            min={prop.min}
            max={prop.max}
            value={Number(value ?? 0)}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          {help}
        </div>
      )

    case "image": {
      const url = String(value ?? "")
      return (
        <div className="space-y-1.5">
          <Label>{prop.label}</Label>
          <ImageUploader
            kind="accommodation"
            max={1}
            label="Upload image"
            images={url ? [{ url, publicId: url }] : []}
            onChange={(images) => onChange(images[0]?.url ?? "")}
          />
          {help}
        </div>
      )
    }

    case "imageList": {
      const images = Array.isArray(value)
        ? (value as { url?: unknown; publicId?: unknown }[]).map((item) => ({
            url: String(item?.url ?? ""),
            publicId: String(item?.publicId ?? ""),
          }))
        : []

      return (
        <div className="space-y-1.5">
          <Label>{prop.label}</Label>
          <ImageUploader
            kind="accommodation"
            max={12}
            label="Add pictures"
            images={images}
            onChange={onChange}
          />
          {help}
        </div>
      )
    }

    case "stringList":
      return (
        <ListEditor
          label={prop.label}
          items={Array.isArray(value) ? (value as string[]).map(String) : []}
          onChange={onChange}
          help={prop.help}
        />
      )

    case "pairList":
      return (
        <PairEditor
          label={prop.label}
          items={
            Array.isArray(value)
              ? (value as { label?: unknown; value?: unknown }[]).map((item) => ({
                  label: String(item?.label ?? ""),
                  value: String(item?.value ?? ""),
                }))
              : []
          }
          onChange={onChange}
        />
      )

    case "url":
    case "text":
    default:
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id}>{prop.label}</Label>
          <Input
            id={id}
            value={String(value ?? "")}
            placeholder={prop.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          {help}
        </div>
      )
  }
}

function ListEditor({
  label,
  items,
  onChange,
  help,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  help?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <Textarea
            rows={2}
            value={item}
            onChange={(event) => {
              const next = [...items]
              next[index] = event.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove item ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus className="size-4" /> Add item
      </Button>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  )
}

function PairEditor({
  label,
  items,
  onChange,
}: {
  label: string
  items: { label: string; value: string }[]
  onChange: (items: { label: string; value: string }[]) => void
}) {
  function update(index: number, patch: Partial<{ label: string; value: string }>) {
    const next = [...items]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((item, index) => (
        <div key={index} className="space-y-1.5 rounded-lg border p-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={item.label}
              placeholder="Label"
              onChange={(event) => update(index, { label: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${item.label || `item ${index + 1}`}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea
            rows={2}
            value={item.value}
            placeholder="Value"
            onChange={(event) => update(index, { value: event.target.value })}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { label: "", value: "" }])}
      >
        <Plus className="size-4" /> Add
      </Button>
    </div>
  )
}
