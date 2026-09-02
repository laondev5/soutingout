import "server-only"
import Pusher from "pusher"

let client: Pusher | null = null

export function isPusherConfigured() {
  return Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.PUSHER_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.PUSHER_CLUSTER
  )
}

function getClient() {
  if (client) return client

  client = new Pusher({
    appId: process.env.PUSHER_APP_ID as string,
    key: process.env.PUSHER_KEY as string,
    secret: process.env.PUSHER_SECRET as string,
    cluster: process.env.PUSHER_CLUSTER as string,
    useTLS: true,
  })

  return client
}

export const CHANNELS = {
  dashboard: "dashboard",
} as const

export type DashboardEvent =
  | { type: "delegate.registered"; delegateId: string; fullName: string }
  | { type: "payment.confirmed"; delegateId: string; fullName: string; lffId: string | null }
  | { type: "delegate.assigned"; delegateId: string; toUserId: string }

/**
 * Fire-and-forget. Realtime is a convenience on top of the data that is
 * already persisted, so a Pusher outage must never fail the request that
 * triggered it — and an unconfigured Pusher is simply a no-op.
 */
export async function publishDashboardEvent(event: DashboardEvent) {
  if (!isPusherConfigured()) return

  try {
    await getClient().trigger(CHANNELS.dashboard, event.type, event)
  } catch (error) {
    console.error("Failed to publish dashboard event", { type: event.type, error })
  }
}
