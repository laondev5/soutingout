import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function Field({
  label,
  htmlFor,
  error,
  required,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const describedBy = error ? `${htmlFor}-error` : undefined

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>

      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}

      <div aria-describedby={describedBy}>{children}</div>

      {error ? (
        <p id={describedBy} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
