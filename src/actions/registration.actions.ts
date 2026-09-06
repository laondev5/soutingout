"use server"

import { AccommodationModel, BookingModel, DelegateModel } from "@/lib/db-models"
import { connectDB } from "@/lib/mongoose"
import { registrationSchema, type RegistrationInput } from "@/lib/registration-schema"
import { bedsAvailableFor } from "@/lib/accommodation"
import { fitsParty, quote } from "@/lib/pricing"
import { autoAssignNewDelegate } from "@/lib/assignment"
import { trySendEmail } from "@/lib/email"
import { registrationReceivedEmail } from "@/lib/email-templates"
import { logActivity } from "@/lib/activity-log"
import { publishDashboardEvent } from "@/lib/pusher"
import { companionStepFor, familyMemberCount, type AdditionalServiceId } from "@/lib/constants"
import { customFieldsSchema, getActiveFormFields } from "@/lib/form-config"
import { generateStatusToken } from "@/lib/status-token"

export type RegistrationResult =
  | {
      ok: true
      delegateId: string
      totalDue: number
      accommodationName: string
      /** Opens this delegate's own status page with no email/LFF ID typing. */
      statusToken: string
    }
  | {
      ok: false
      error: string
      fieldErrors?: Record<string, string[]>
      customFieldErrors?: Record<string, string>
    }

export async function submitRegistration(
  input: RegistrationInput & { customFields?: Record<string, unknown> }
): Promise<RegistrationResult> {
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

  // Custom questions are validated against the live field definitions, so a
  // crafted payload cannot smuggle in keys nobody asked for.
  const activeFields = await getActiveFormFields()
  const customParsed = customFieldsSchema(activeFields).safeParse(input.customFields ?? {})

  if (!customParsed.success) {
    const customFieldErrors: Record<string, string> = {}
    for (const issue of customParsed.error.issues) {
      const key = String(issue.path[0] ?? "")
      if (key && !customFieldErrors[key]) customFieldErrors[key] = issue.message
    }

    return {
      ok: false,
      error: "Please check the highlighted fields.",
      customFieldErrors,
    }
  }

  const accommodation = await AccommodationModel.findById(values.accommodationId)
  if (!accommodation || !accommodation.isActive) {
    return { ok: false, error: "That accommodation is no longer available. Please pick another." }
  }

  const accommodationShape = {
    name: accommodation.name,
    pricePerPerson: accommodation.pricePerPerson,
    pricingMode: (accommodation.pricingMode ?? "per_person") as "per_person" | "flat",
    capacityPerUnit: accommodation.capacityPerUnit ?? 1,
    isFree: accommodation.isFree ?? false,
  }

  // Recompute server-side — never trust a total that came from the browser.
  const priced = quote({
    accommodation: accommodationShape,
    comingWith: values.comingWith,
    additionalServices: values.additionalServices as AdditionalServiceId[],
  })

  // A flat-priced unit is booked whole, so a party bigger than it can hold
  // must be rejected here too — the stepper hides these, but nothing stops a
  // request built by hand.
  if (!fitsParty(accommodationShape, priced.partySize)) {
    return {
      ok: false,
      error: `${accommodation.name} does not have room for a party of ${priced.partySize}. Please choose a larger option.`,
    }
  }

  const available = await bedsAvailableFor(accommodation._id)
  if (available < priced.bedsRequired) {
    return {
      ok: false,
      error: `${accommodation.name} no longer has room for ${priced.bedsRequired} ${
        priced.bedsRequired === 1 ? "person" : "people"
      }. Please choose another accommodation.`,
    }
  }

  // One email can register more than one delegate — a parent registering
  // several family members separately, for instance — so no uniqueness check
  // runs here. Each delegate still gets their own LFF ID, accommodation and
  // status page; email is only ever a contact address, never an identity key.

  const companions = buildCompanions(values)
  const statusToken = generateStatusToken()

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
    customFields: customParsed.data,
    statusToken,
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

  await publishDashboardEvent({
    type: "delegate.registered",
    delegateId: String(delegate._id),
    fullName: values.fullName,
    totalDue: priced.total,
  })

  await trySendEmail({
    to: values.email,
    ...registrationReceivedEmail({
      fullName: values.fullName,
      accommodationName: accommodation.name,
      totalDue: priced.total,
      statusToken,
    }),
  })

  return {
    ok: true,
    delegateId: String(delegate._id),
    totalDue: priced.total,
    accommodationName: accommodation.name,
    statusToken,
  }
}

/** Flatten the form's two conditional sections into one companion list. */
function buildCompanions(values: {
  comingWith: RegistrationInput["comingWith"]
  partnerFullName?: string
  partnerPhone?: string
  partnerWhatsapp?: string
  partnerGender?: "Male" | "Female"
  familyMember1FullName?: string
  familyMember1Gender?: "Male" | "Female"
  familyMember1Phone?: string
  familyMember1Whatsapp?: string
  familyMember2FullName?: string
  familyMember2Gender?: "Male" | "Female"
  familyMember2Phone?: string
  familyMember2Whatsapp?: string
  familyMember3FullName?: string
  familyMember3Gender?: "Male" | "Female"
  familyMember3Phone?: string
  familyMember3Whatsapp?: string
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
    const members = [
      {
        fullName: values.familyMember1FullName,
        gender: values.familyMember1Gender,
        phone: values.familyMember1Phone,
        whatsapp: values.familyMember1Whatsapp,
      },
      {
        fullName: values.familyMember2FullName,
        gender: values.familyMember2Gender,
        phone: values.familyMember2Phone,
        whatsapp: values.familyMember2Whatsapp,
      },
      {
        fullName: values.familyMember3FullName,
        gender: values.familyMember3Gender,
        phone: values.familyMember3Phone,
        whatsapp: values.familyMember3Whatsapp,
      },
    ]

    return members
      .slice(0, familyMemberCount(values.comingWith))
      .filter((member): member is typeof member & { fullName: string } => Boolean(member.fullName))
      .map((member) => ({
        kind: "family_member" as const,
        fullName: member.fullName,
        gender: member.gender,
        phone: member.phone ?? "",
        whatsapp: member.whatsapp ?? "",
      }))
  }

  return []
}
