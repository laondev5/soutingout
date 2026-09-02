"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Pusher from "pusher-js"
import { toast } from "sonner"
import { formatNaira } from "@/lib/constants"

type DashboardEvent =
  | { type: "delegate.registered"; delegateId: string; fullName: string; totalDue?: number }
  | { type: "payment.confirmed"; delegateId: string; fullName: string; lffId: string | null; amount?: number }
  | { type: "delegate.assigned"; delegateId: string; toUserId: string; fullName?: string }

const CHANNEL = "dashboard"

/**
 * Subscribes the dashboard to live events and refreshes the server components
 * when something happens elsewhere.
 *
 * Renders nothing. Mounted once in the dashboard layout, and a no-op when
 * Pusher is not configured — the app works exactly the same, just without the
 * live nudge.
 */
export function LiveUpdates({
  pusherKey,
  cluster,
  userId,
}: {
  pusherKey: string | null
  cluster: string | null
  userId: string
}) {
  const router = useRouter()
  const [connected, setConnected] = useState(false)

  // Refreshing on every event would thrash the server on a busy day, so
  // refreshes are coalesced into one call per short window.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pusherKey || !cluster) return

    const pusher = new Pusher(pusherKey, { cluster, forceTLS: true })
    const channel = pusher.subscribe(CHANNEL)

    pusher.connection.bind("connected", () => setConnected(true))
    pusher.connection.bind("disconnected", () => setConnected(false))

    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => router.refresh(), 1200)
    }

    function onRegistered(data: DashboardEvent) {
      if (data.type !== "delegate.registered") return
      toast.info(`New registration: ${data.fullName}`)
      scheduleRefresh()
    }

    function onConfirmed(data: DashboardEvent) {
      if (data.type !== "payment.confirmed") return
      toast.success(
        `Payment confirmed: ${data.fullName}${data.amount ? ` — ${formatNaira(data.amount)}` : ""}`
      )
      scheduleRefresh()
    }

    function onAssigned(data: DashboardEvent) {
      if (data.type !== "delegate.assigned") return
      // Only the person who received the delegate needs telling.
      if (data.toUserId === userId) {
        toast.info(`${data.fullName ?? "A delegate"} was assigned to you.`)
      }
      scheduleRefresh()
    }

    channel.bind("delegate.registered", onRegistered)
    channel.bind("payment.confirmed", onConfirmed)
    channel.bind("delegate.assigned", onAssigned)

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      channel.unbind_all()
      pusher.unsubscribe(CHANNEL)
      pusher.disconnect()
    }
  }, [pusherKey, cluster, userId, router])

  if (!pusherKey || !cluster) return null

  return (
    <span
      aria-live="polite"
      className="sr-only"
    >
      {connected ? "Live updates connected" : "Live updates connecting"}
    </span>
  )
}
