import { CounterModel } from "@/lib/db-models"
import { EVENT } from "@/lib/constants"

const DELEGATE_SEQUENCE = `delegate:${EVENT.tag}`
const PAD = 4

/**
 * Atomically claim the next delegate number. `findOneAndUpdate` with `$inc` is
 * a single document operation, so concurrent confirmations can never be handed
 * the same number.
 */
export async function nextDelegateNumber() {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: DELEGATE_SEQUENCE },
    { $inc: { value: 1 } },
    { returnDocument: "after", upsert: true }
  )

  return counter.value
}

export function formatLffId(delegateNumber: number) {
  return `LFF-${EVENT.tag}-${String(delegateNumber).padStart(PAD, "0")}`
}

export function formatAccommodationCode(codePrefix: string, delegateNumber: number) {
  return `${codePrefix.toUpperCase()}-${EVENT.tag}-${String(delegateNumber).padStart(PAD, "0")}`
}

/**
 * Both identifiers for a delegate, sharing one sequence number so they line up:
 * LFF-KMS26-0007 and GEN-KMS26-0007.
 */
export function identifiersFor(input: { delegateNumber: number; codePrefix: string }) {
  return {
    lffId: formatLffId(input.delegateNumber),
    accommodationCode: formatAccommodationCode(input.codePrefix, input.delegateNumber),
  }
}
