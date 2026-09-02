/**
 * The registration form's editable shape.
 *
 * Built-in fields map to real Delegate columns and cannot be deleted or
 * retyped — pricing, assignment and the Sheet import all depend on them. What
 * the super admin *can* change is their wording, help text and (for the
 * genuinely optional ones) whether they are required or shown at all.
 *
 * Custom fields are additive: they are stored in `Delegate.customFields` and
 * never affect pricing.
 */

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "number",
  "select",
  "radio",
  "checkbox",
  "checkboxGroup",
  "date",
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email address",
  tel: "Phone number",
  number: "Number",
  select: "Dropdown",
  radio: "Single choice",
  checkbox: "Single checkbox",
  checkboxGroup: "Multiple choice",
  date: "Date",
}

/** Types whose answers come from a fixed option list. */
export const OPTION_TYPES: FieldType[] = ["select", "radio", "checkboxGroup"]

export function needsOptions(type: FieldType) {
  return OPTION_TYPES.includes(type)
}

/** The stepper screens a custom field can be attached to. */
export const FORM_STEPS = [
  { id: "personal", name: "Personal data" },
  { id: "comingWith", name: "Who are you coming with" },
  { id: "accommodation", name: "Accommodation" },
  { id: "feeding", name: "Feeding & comments" },
  { id: "services", name: "Additional services" },
  { id: "payment", name: "Payment" },
] as const

export type FormStepId = (typeof FORM_STEPS)[number]["id"]

export const FORM_STEP_IDS = FORM_STEPS.map((step) => step.id)

export type FormFieldConfig = {
  id: string
  /** Stable key. For built-ins this is the Delegate column name. */
  key: string
  label: string
  type: FieldType
  step: FormStepId
  required: boolean
  placeholder: string
  helpText: string
  options: string[]
  order: number
  isActive: boolean
  /** Built-ins are wired into pricing and the import; only wording is editable. */
  isBuiltIn: boolean
  /** Built-ins that must always be collected, whatever the settings say. */
  isLocked: boolean
}

/**
 * The built-in fields, in the order the stepper renders them. Seeded into the
 * database on first load so the editor has something to show, and used as the
 * fallback whenever the collection is empty.
 */
export const BUILT_IN_FIELDS: Omit<FormFieldConfig, "id">[] = [
  {
    key: "fullName",
    label: "Full names",
    type: "text",
    step: "personal",
    required: true,
    placeholder: "Surname first",
    helpText: "",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "whatsappNumber",
    label: "WhatsApp number",
    type: "tel",
    step: "personal",
    required: true,
    placeholder: "08012345678",
    helpText: "We send confirmations here.",
    options: [],
    order: 20,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "phoneNumber",
    label: "Phone number",
    type: "tel",
    step: "personal",
    required: true,
    placeholder: "08012345678",
    helpText: "",
    options: [],
    order: 30,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    step: "personal",
    required: true,
    placeholder: "you@example.com",
    helpText: "Your LFF ID is emailed here once payment is confirmed.",
    options: [],
    order: 40,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "gender",
    label: "Gender",
    type: "radio",
    step: "personal",
    required: false,
    placeholder: "",
    helpText: "",
    options: ["Male", "Female"],
    order: 50,
    isActive: true,
    isBuiltIn: true,
    isLocked: false,
  },
  {
    key: "comingWith",
    label: "Who are you coming with?",
    type: "radio",
    step: "comingWith",
    required: true,
    placeholder: "",
    helpText: "This decides how many beds we hold and what you pay.",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "accommodationId",
    label: "Accommodation",
    type: "radio",
    step: "accommodation",
    required: true,
    placeholder: "",
    helpText: "",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
  {
    key: "comments",
    label: "Comments if any",
    type: "textarea",
    step: "feeding",
    required: false,
    placeholder: "Anything we should know",
    helpText: "",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: false,
  },
  {
    key: "additionalServices",
    label: "Additional services",
    type: "checkboxGroup",
    step: "services",
    required: false,
    placeholder: "",
    helpText: "",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: false,
  },
  {
    key: "paidRetreatConsent",
    label: "I understand that this is a paid retreat.",
    type: "checkbox",
    step: "payment",
    required: true,
    placeholder: "",
    helpText: "",
    options: [],
    order: 10,
    isActive: true,
    isBuiltIn: true,
    isLocked: true,
  },
]

/** Keys reserved by built-ins, so a custom field cannot shadow a real column. */
export const RESERVED_KEYS = new Set([
  ...BUILT_IN_FIELDS.map((field) => field.key),
  "companions",
  "lffId",
  "accommodationCode",
  "delegateNumber",
  "registrationStatus",
  "totalDue",
  "totalPaid",
  "assignedSubAdminId",
  "assignedPastorId",
  "source",
  "importBatchId",
  "customFields",
  "_id",
  "__proto__",
  "constructor",
  "prototype",
])

/** Turn a label into a safe storage key. */
export function keyFromLabel(label: string) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)

  return base || "field"
}
