import { ActivityLogModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"

export type ActivityInput = {
  actorUserId?: string | null
  action: string
  entityType:
    | "user"
    | "delegate"
    | "payment"
    | "accommodation"
    | "import"
    | "assignment"
    | "site_content"
    | "form_field"
  entityId?: string | null
  details?: Record<string, unknown>
}

/**
 * Auditing must never take down the operation it is recording, so a logging
 * failure is swallowed after being reported to the server console.
 */
export async function logActivity(input: ActivityInput) {
  try {
    await connectDB()
    await ActivityLogModel.create({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details ?? {},
    })
  } catch (error) {
    console.error("Failed to write activity log", { action: input.action, error })
  }
}
