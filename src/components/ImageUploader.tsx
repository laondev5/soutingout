"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export type UploadedImage = { url: string; publicId: string }

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Two-step signed upload: ask our server to sign, then POST the file straight
 * to Cloudinary. The file never passes through this app, so a large image
 * doesn't sit in a serverless function's memory or count against its body
 * limit.
 */
export function ImageUploader({
  kind,
  images,
  onChange,
  max = 5,
  label = "Add image",
  email,
}: {
  kind: "accommodation" | "receipt"
  images: UploadedImage[]
  onChange: (images: UploadedImage[]) => void
  max?: number
  label?: string
  /** Required for receipt uploads by a delegate, who has no session. */
  email?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Choose an image or a PDF.")
      return
    }

    if (file.size > MAX_BYTES) {
      setError("That file is larger than 5MB.")
      return
    }

    setBusy(true)

    try {
      const signResponse = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email }),
      })

      if (!signResponse.ok) {
        const body = (await signResponse.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Could not start the upload.")
      }

      const signed = (await signResponse.json()) as {
        signature: string
        timestamp: number
        folder: string
        apiKey: string
        uploadUrl: string
      }

      const form = new FormData()
      form.append("file", file)
      form.append("api_key", signed.apiKey)
      form.append("timestamp", String(signed.timestamp))
      form.append("folder", signed.folder)
      form.append("signature", signed.signature)

      const uploadResponse = await fetch(signed.uploadUrl, { method: "POST", body: form })

      if (!uploadResponse.ok) {
        throw new Error("Cloudinary rejected the upload.")
      }

      const result = (await uploadResponse.json()) as {
        secure_url: string
        public_id: string
      }

      onChange([...images, { url: result.secure_url, publicId: result.public_id }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {images.map((image) => (
            <li key={image.publicId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="size-24 rounded-lg border object-cover"
              />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => onChange(images.filter((i) => i.publicId !== image.publicId))}
                className="absolute -right-2 -top-2 rounded-full border bg-background p-1 shadow-sm"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {images.length < max ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <ImagePlus className="size-4" /> {label}
              </>
            )}
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
