import {
  ADDITIONAL_SERVICES,
  familyMemberCount,
  type AdditionalServiceId,
  type ComingWith,
  type PricingMode,
} from "@/lib/constants"

/**
 * The pricing inputs we need from an Accommodation, so this module stays
 * usable against both a Mongoose document and the plain seed constant.
 */
export type PriceableAccommodation = {
  name: string
  pricePerPerson: number
  pricingMode: PricingMode
  capacityPerUnit: number
  isFree?: boolean
}

export type QuoteLine = {
  label: string
  detail?: string
  amount: number
}

export type Quote = {
  partySize: number
  bedsRequired: number
  lines: QuoteLine[]
  accommodationTotal: number
  servicesTotal: number
  total: number
}

/** The registrant plus anyone they are registering alongside them. */
export function partySizeFor(comingWith: ComingWith | null | undefined) {
  switch (comingWith) {
    case "My spouse":
    case "A friend/ a sibling (same sex)":
      return 2
    case "My family of 3 (i.e me and 2 other family members)":
    case "My family of 4 (i.e me and 3 other family members)":
      return 1 + familyMemberCount(comingWith)
    default:
      return 1
  }
}

/**
 * A `flat` unit is taken whole — booking a VIP lodge for two people still
 * retires the whole lodge. A `per_person` tier consumes one bed per head.
 */
export function bedsRequiredFor(
  accommodation: Pick<PriceableAccommodation, "pricingMode" | "capacityPerUnit">,
  partySize: number
) {
  return accommodation.pricingMode === "flat"
    ? accommodation.capacityPerUnit
    : partySize
}

/**
 * Whether a party can physically fit in a tier.
 *
 * A `per_person` tier scales with the party — each person takes their own bed,
 * so there is no upper limit. A `flat` tier is booked as one whole unit
 * regardless of headcount, so a family bigger than that unit's capacity
 * literally would not fit — e.g. a family of 4 cannot go in a lodge built for
 * 3, even though the price is charged once either way.
 */
export function fitsParty(
  accommodation: Pick<PriceableAccommodation, "pricingMode" | "capacityPerUnit">,
  partySize: number
) {
  return accommodation.pricingMode !== "flat" || accommodation.capacityPerUnit >= partySize
}

export function quote(input: {
  accommodation: PriceableAccommodation | null
  comingWith: ComingWith | null | undefined
  additionalServices: readonly AdditionalServiceId[]
}): Quote {
  const partySize = partySizeFor(input.comingWith)
  const lines: QuoteLine[] = []

  let accommodationTotal = 0
  let bedsRequired = 0

  if (input.accommodation) {
    const { name, pricePerPerson, pricingMode, isFree } = input.accommodation
    bedsRequired = bedsRequiredFor(input.accommodation, partySize)

    if (isFree) {
      lines.push({ label: name, detail: "Free", amount: 0 })
    } else if (pricingMode === "per_person") {
      // The form is explicit: shared accommodation does not reduce the
      // per-person fee, so couples in a hostel each pay in full.
      accommodationTotal = pricePerPerson * partySize
      lines.push({
        label: name,
        detail: partySize > 1 ? `${partySize} people` : undefined,
        amount: accommodationTotal,
      })
    } else {
      accommodationTotal = pricePerPerson
      lines.push({
        label: name,
        detail: partySize > 1 ? `whole unit, ${partySize} people` : "whole unit",
        amount: accommodationTotal,
      })
    }
  }

  // Services are billed once per registration, not per head.
  let servicesTotal = 0
  for (const service of ADDITIONAL_SERVICES) {
    if (input.additionalServices.includes(service.id)) {
      servicesTotal += service.price
      lines.push({ label: service.name, amount: service.price })
    }
  }

  return {
    partySize,
    bedsRequired,
    lines,
    accommodationTotal,
    servicesTotal,
    total: accommodationTotal + servicesTotal,
  }
}
