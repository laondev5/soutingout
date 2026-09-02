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

/**
 * The key and cluster the browser needs to subscribe.
 *
 * Read on the server and handed to `LiveUpdates` as props, so these do not
 * need a `NEXT_PUBLIC_` prefix — that is only required when the code reading
 * `process.env` is itself in the client bundle. The prefixed names are still
 * accepted so an existing deployment keeps working.
 */
export function pusherClientConfig() {
  return {
    // Not named `key`: React reserves that prop, so it would be swallowed as
    // the element key and never reach the component.
    pusherKey: process.env.PUSHER_KEY ?? process.env.NEXT_PUBLIC_PUSHER_KEY ?? null,
    cluster: process.env.PUSHER_CLUSTER ?? process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? null,
  }
}

export const CHANNELS = {
  dashboard: "dashboard",
} as const

export type DashboardEvent =
  | { type: "delegate.registered"; delegateId: string; fullName: string; totalDue?: number }
  | {
      type: "payment.confirmed"
      delegateId: string
      fullName: string
      lffId: string | null
      amount?: number
    }
  | { type: "delegate.assigned"; delegateId: string; toUserId: string; fullName?: string }

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
