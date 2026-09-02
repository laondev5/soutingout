"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { confirmSubmittedPayment } from "@/actions/delegate.actions"

export function ConfirmPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function onConfirm() {
    startTransition(async () => {
      const result = await confirmSubmittedPayment({ paymentId })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      setDone(true)
      toast.success("Payment confirmed. The delegate has been emailed their LFF ID.")
      router.refresh()
    })
  }

  return (
    <Button size="sm" onClick={onConfirm} disabled={pending || done}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      Confirm
    </Button>
  )
}
