"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setPasswordWithToken } from "@/actions/password.actions"
import { MIN_PASSWORD_LENGTH } from "@/lib/password-setup"

export function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const result = await setPasswordWithToken({ token, password, confirmPassword })

      if (!result.ok) {
        setError(result.error)
        return
      }

      // Straight to the sign-in form rather than logging them in here: the
      // password they just chose is the thing to prove works.
      router.push("/auth/login?passwordSet=1")
      router.refresh()
    } catch {
      setError("Something went wrong setting your password. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Saving…
          </>
        ) : (
          "Set my password"
        )}
      </Button>
    </form>
  )
}
