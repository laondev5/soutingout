import { z } from "zod"
import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  GENDERS,
  companionStepFor,
  familyMemberCount,
  type AdditionalServiceId,
} from "@/lib/constants"

// Typed as a literal tuple so z.enum yields the union, not plain `string`.
const serviceIds = ADDITIONAL_SERVICES.map((service) => service.id) as [
  AdditionalServiceId,
  ...AdditionalServiceId[],
]

/** Nigerian numbers arrive in many shapes; accept anything plausibly dialable. */
const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "That number looks too long")
  .regex(/^[0-9+()\-\s]+$/, "Use digits only, optionally with + ( ) or -")

export const registrationSchema = z
  .object({
    // Personal Data
    fullName: z.string().trim().min(2, "Enter your full names"),
    whatsappNumber: phone,
    phoneNumber: phone,
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    gender: z.enum(GENDERS).optional(),

    // Who are you coming with
    comingWith: z.enum(COMING_WITH_OPTIONS, {
      message: "Tell us who you are coming with",
    }),

    // Spouse / friend / sibling — required only when that branch is taken
    partnerFullName: z.string().trim().optional().or(z.literal("")),
    partnerPhone: z.string().trim().optional().or(z.literal("")),
    partnerWhatsapp: z.string().trim().optional().or(z.literal("")),
    partnerGender: z.enum(GENDERS).optional(),

    // Family of 3 or 4 — the form collects name and gender in one field
    familyMember1: z.string().trim().optional().or(z.literal("")),
    familyMember2: z.string().trim().optional().or(z.literal("")),
    familyMember3: z.string().trim().optional().or(z.literal("")),

    accommodationId: z.string().min(1, "Choose your accommodation"),
    comments: z.string().trim().max(2000, "Please keep this under 2000 characters").default(""),
    additionalServices: z.array(z.enum(serviceIds)).default([]),

    paidRetreatConsent: z.literal(true, {
      message: "You must acknowledge that this is a paid retreat",
    }),
  })
  .superRefine((value, ctx) => {
    const branch = companionStepFor(value.comingWith)

    if (branch === "partner" && !value.partnerFullName) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerFullName"],
        message: "Enter the full names of who you are coming with",
      })
    }

    if (branch === "family") {
      const required = familyMemberCount(value.comingWith)
      const fields = ["familyMember1", "familyMember2", "familyMember3"] as const

      for (let index = 0; index < required; index += 1) {
        if (!value[fields[index]]) {
          ctx.addIssue({
            code: "custom",
            path: [fields[index]],
            message: `Enter the full name and gender of family member ${index + 1}`,
          })
        }
      }
    }
  })

export type RegistrationInput = z.input<typeof registrationSchema>
export type RegistrationValues = z.output<typeof registrationSchema>

/**
 * Field groups per step, so the stepper can validate only what is on screen.
 * Steps 1, 2 and 8 are informational and hold no fields.
 */
export const STEP_FIELDS = {
  personal: ["fullName", "whatsappNumber", "phoneNumber", "email", "gender"],
  comingWith: ["comingWith"],
  partner: ["partnerFullName", "partnerPhone", "partnerWhatsapp", "partnerGender"],
  family: ["familyMember1", "familyMember2", "familyMember3"],
  accommodation: ["accommodationId"],
  feeding: ["comments"],
  services: ["additionalServices"],
  payment: ["paidRetreatConsent"],
} as const satisfies Record<string, readonly (keyof RegistrationInput)[]>

export type StepKey = keyof typeof STEP_FIELDS
