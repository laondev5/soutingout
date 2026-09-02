"use server"

import { AccommodationModel, BookingModel, DelegateModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { registrationSchema, type RegistrationInput } from "@/lib/registration-schema"
import { bedsAvailableFor } from "@/lib/accommodation"
import { quote } from "@/lib/pricing"
import { autoAssignNewDelegate } from "@/lib/assignment"
import { trySendEmail } from "@/lib/email"
import { registrationReceivedEmail } from "@/lib/email-templates"
import { logActivity } from "@/lib/activity-log"
import { companionStepFor, familyMemberCount, type AdditionalServiceId } from "@/lib/constants"

export type RegistrationResult =
  | {
      ok: true
      delegateId: string
      totalDue: number
      accommodationName: string
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function submitRegistration(input: RegistrationInput): Promise<RegistrationResult> {
  const parsed = registrationSchema.safeParse(input)

  if (!parsed.success) {
    const flattened = parsed.error.flatten()
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: flattened.fieldErrors as Record<string, string[]>,
    }
  }

  const values = parsed.data

  await connectDB()

  const accommodation = await AccommodationModel.findById(values.accommodationId)
  if (!accommodation || !accommodation.isActive) {
    return { ok: false, error: "That accommodation is no longer available. Please pick another." }
  }

  // Recompute server-side — never trust a total that came from the browser.
  const priced = quote({
    accommodation: {
      name: accommodation.name,
      pricePerPerson: accommodation.pricePerPerson,
      pricingMode: (accommodation.pricingMode ?? "per_person") as "per_person" | "flat",
      capacityPerUnit: accommodation.capacityPerUnit ?? 1,
      isFree: accommodation.isFree ?? false,
    },
    comingWith: values.comingWith,
    additionalServices: values.additionalServices as AdditionalServiceId[],
  })

  const available = await bedsAvailableFor(accommodation._id)
  if (available < priced.bedsRequired) {
    return {
      ok: false,
      error: `${accommodation.name} no longer has room for ${priced.bedsRequired} ${
        priced.bedsRequired === 1 ? "person" : "people"
      }. Please choose another accommodation.`,
    }
  }

  const existing = await DelegateModel.findOne({ email: values.email })
  if (existing) {
    return {
      ok: false,
      error:
        "A registration already exists for this email. Check your status page, or contact us if this is a mistake.",
    }
  }

  const companions = buildCompanions(values)

  const delegate = await DelegateModel.create({
    fullName: values.fullName,
    whatsappNumber: values.whatsappNumber,
    phoneNumber: values.phoneNumber,
    email: values.email,
    gender: values.gender,
    comingWith: values.comingWith,
    companions,
    accommodationId: accommodation._id,
    comments: values.comments,
    additionalServices: values.additionalServices,
    paidRetreatConsent: values.paidRetreatConsent,
    registrationStatus: "pending",
    totalDue: priced.total,
    totalPaid: 0,
    source: "registration_form",
  })

  await BookingModel.create({
    delegateId: delegate._id,
    accommodationId: accommodation._id,
    beds: priced.bedsRequired,
    unitPrice: accommodation.pricePerPerson,
    amount: priced.accommodationTotal,
    status: "held",
  })

  // No placeholder Payment is created here. What is owed lives on the
  // delegate (totalDue vs totalPaid); a Payment row is only written when money
  // actually moves — a receipt a sub-admin confirms, or a Paystack checkout.
  // Creating one up front left a phantom "pending" row in the payments queue
  // after the real payment was confirmed.

  await autoAssignNewDelegate(delegate._id)

  await logActivity({
    action: "delegate.registered",
    entityType: "delegate",
    entityId: String(delegate._id),
    details: {
      email: values.email,
      accommodation: accommodation.name,
      totalDue: priced.total,
      partySize: priced.partySize,
    },
  })

  await trySendEmail({
    to: values.email,
    ...registrationReceivedEmail({
      fullName: values.fullName,
      accommodationName: accommodation.name,
      totalDue: priced.total,
    }),
  })

  return {
    ok: true,
    delegateId: String(delegate._id),
    totalDue: priced.total,
    accommodationName: accommodation.name,
  }
}

/** Flatten the form's two conditional sections into one companion list. */
function buildCompanions(values: {
  comingWith: RegistrationInput["comingWith"]
  partnerFullName?: string
  partnerPhone?: string
  partnerWhatsapp?: string
  partnerGender?: "Male" | "Female"
  familyMember1?: string
  familyMember2?: string
  familyMember3?: string
}) {
  const branch = companionStepFor(values.comingWith)

  if (branch === "partner" && values.partnerFullName) {
    return [
      {
        kind: values.comingWith === "My spouse" ? ("spouse" as const) : ("friend_sibling" as const),
        fullName: values.partnerFullName,
        phone: values.partnerPhone ?? "",
        whatsapp: values.partnerWhatsapp ?? "",
        gender: values.partnerGender,
      },
    ]
  }

  if (branch === "family") {
    const names = [values.familyMember1, values.familyMember2, values.familyMember3]
    return names
      .slice(0, familyMemberCount(values.comingWith))
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ kind: "family_member" as const, fullName: name }))
  }

  return []
}
