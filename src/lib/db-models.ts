import mongoose, { Schema, type Model, type Types } from "mongoose"
import type {
  AdditionalServiceId,
  ComingWith,
  Gender,
  PastoralStatus,
  PaymentStatus,
  Permission,
  PricingMode,
  RegistrationStatus,
  Role,
} from "@/lib/constants"
import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  GENDERS,
  PASTORAL_STATUSES,
  PAYMENT_STATUSES,
  PERMISSIONS,
  PRICING_MODES,
  REGISTRATION_STATUSES,
  ROLES,
} from "@/lib/constants"

/**
 * Document types are written out by hand rather than derived with
 * `InferSchemaType`. Inference across this many schemas expands badly enough
 * to exhaust an 8GB type-checker heap; explicit interfaces are both cheap to
 * check and more precise about nullability.
 */

const serviceIds = ADDITIONAL_SERVICES.map((service) => service.id)

type Timestamps = {
  createdAt: Date
  updatedAt: Date
}

/** Reuse the compiled model across hot reloads instead of recompiling it. */
function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema)
}

// ── User ─────────────────────────────────────────────────────────────
// Staff only: super_admin, sub_admin, pastor. Delegates are not Users.

export interface IUser extends Timestamps {
  _id: Types.ObjectId
  name: string
  email: string
  passwordHash: string
  role: Role
  permissions: Permission[]
  phone?: string
  isActive: boolean
  /** 0 means unlimited. Respected by the auto-assignment engine. */
  maxDelegates: number
  createdByUserId?: Types.ObjectId | null
  lastLoginAt?: Date | null
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    maxDelegates: { type: Number, default: 0, min: 0 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
)

userSchema.index({ role: 1, isActive: 1 })

export const UserModel = model<IUser>("User", userSchema)

// ── Accommodation ────────────────────────────────────────────────────

export interface IAccommodationImage {
  url: string
  publicId: string
}

export interface IAccommodation extends Timestamps {
  _id: Types.ObjectId
  name: string
  /** Drives the delegate's accommodation code, e.g. GEN-KMS26-0007. */
  codePrefix: string
  description: string
  /** Verbatim Google Form dropdown option, used to match imported rows. */
  formLabel?: string
  pricePerPerson: number
  pricingMode: PricingMode
  isFree: boolean
  totalBeds: number
  bedsReserved: number
  capacityPerUnit: number
  images: IAccommodationImage[]
  isActive: boolean
  sortOrder: number
}

const accommodationImageSchema = new Schema<IAccommodationImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
)

const accommodationSchema = new Schema<IAccommodation>(
  {
    name: { type: String, required: true, trim: true },
    codePrefix: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: "" },
    formLabel: { type: String, trim: true },
    pricePerPerson: { type: Number, required: true, min: 0 },
    pricingMode: { type: String, enum: PRICING_MODES, default: "per_person" },
    isFree: { type: Boolean, default: false },
    totalBeds: { type: Number, required: true, min: 0 },
    bedsReserved: { type: Number, default: 0, min: 0 },
    capacityPerUnit: { type: Number, default: 1, min: 1 },
    images: { type: [accommodationImageSchema], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
)

accommodationSchema.index({ isActive: 1, sortOrder: 1 })

export const AccommodationModel = model<IAccommodation>("Accommodation", accommodationSchema)

// ── Delegate ─────────────────────────────────────────────────────────

export interface ICompanion {
  kind: "spouse" | "friend_sibling" | "family_member"
  fullName: string
  phone?: string
  whatsapp?: string
  gender?: Gender
}

export interface IDelegate extends Timestamps {
  _id: Types.ObjectId

  // Personal Data — form section 3
  fullName: string
  whatsappNumber: string
  phoneNumber: string
  email: string
  gender?: Gender

  // Who are you coming with — form section 4, plus its conditional sections
  comingWith: ComingWith
  companions: ICompanion[]

  // Accommodation — form section 7
  accommodationId: Types.ObjectId | null

  // Feeding + services — form sections 8 and 9
  comments: string
  additionalServices: AdditionalServiceId[]
  paidRetreatConsent: boolean

  // Issued together, only once payment is confirmed
  lffId: string | null
  accommodationCode: string | null
  /** Sequence number backing both identifiers. Null until confirmed. */
  delegateNumber: number | null

  registrationStatus: RegistrationStatus
  assignedSubAdminId: Types.ObjectId | null
  assignedPastorId: Types.ObjectId | null

  totalDue: number
  totalPaid: number

  source: "registration_form" | "google_sheet_import" | "manual"
  importBatchId: Types.ObjectId | null
  confirmedAt: Date | null

  /** Answers to super-admin-defined fields. Never affects pricing. */
  customFields: Record<string, unknown>
}

const companionSchema = new Schema<ICompanion>(
  {
    kind: {
      type: String,
      enum: ["spouse", "friend_sibling", "family_member"],
      required: true,
    },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    gender: { type: String, enum: GENDERS },
  },
  { _id: false }
)

const delegateSchema = new Schema<IDelegate>(
  {
    fullName: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    gender: { type: String, enum: GENDERS },

    comingWith: { type: String, enum: COMING_WITH_OPTIONS, required: true },
    companions: { type: [companionSchema], default: [] },

    accommodationId: { type: Schema.Types.ObjectId, ref: "Accommodation", default: null },

    comments: { type: String, default: "" },
    additionalServices: { type: [String], enum: serviceIds, default: [] },
    paidRetreatConsent: { type: Boolean, default: false },

    lffId: { type: String, default: null },
    accommodationCode: { type: String, default: null },
    delegateNumber: { type: Number, default: null },

    registrationStatus: {
      type: String,
      enum: REGISTRATION_STATUSES,
      default: "pending",
    },

    assignedSubAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assignedPastorId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    totalDue: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },

    source: {
      type: String,
      enum: ["registration_form", "google_sheet_import", "manual"],
      default: "registration_form",
    },
    importBatchId: { type: Schema.Types.ObjectId, ref: "ImportBatch", default: null },
    customFields: { type: Schema.Types.Mixed, default: {} },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Partial, NOT sparse. A sparse index only skips documents where the field is
// absent — these default to `null`, so the field is present and every
// unconfirmed delegate would collide on `null`. Restricting the index to
// string values leaves the unissued ones out of it entirely.
delegateSchema.index(
  { lffId: 1 },
  { unique: true, partialFilterExpression: { lffId: { $type: "string" } } }
)
delegateSchema.index(
  { accommodationCode: 1 },
  { unique: true, partialFilterExpression: { accommodationCode: { $type: "string" } } }
)
delegateSchema.index({ email: 1 })
delegateSchema.index({ phoneNumber: 1 })
// The Sheet import dedupes on email first and WhatsApp second, and does it
// once per row, so both need to be indexed.
delegateSchema.index({ whatsappNumber: 1 })
// Every list is "my delegates, newest first" — the sort key belongs in the
// same index as the scope key, otherwise Mongo sorts the whole scope in memory.
delegateSchema.index({ assignedSubAdminId: 1, registrationStatus: 1 })
delegateSchema.index({ assignedSubAdminId: 1, createdAt: -1 })
delegateSchema.index({ assignedPastorId: 1, createdAt: -1 })
delegateSchema.index({ registrationStatus: 1, createdAt: -1 })
delegateSchema.index({ createdAt: -1 })
// Rollback finds a whole batch by this.
delegateSchema.index({ importBatchId: 1 })

export const DelegateModel = model<IDelegate>("Delegate", delegateSchema)

// ── Booking ──────────────────────────────────────────────────────────

export interface IBooking extends Timestamps {
  _id: Types.ObjectId
  delegateId: Types.ObjectId
  accommodationId: Types.ObjectId
  beds: number
  unitPrice: number
  amount: number
  status: "held" | "confirmed" | "released"
}

const bookingSchema = new Schema<IBooking>(
  {
    delegateId: { type: Schema.Types.ObjectId, ref: "Delegate", required: true },
    accommodationId: { type: Schema.Types.ObjectId, ref: "Accommodation", required: true },
    beds: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["held", "confirmed", "released"], default: "held" },
  },
  { timestamps: true }
)

bookingSchema.index({ delegateId: 1 })
bookingSchema.index({ accommodationId: 1, status: 1 })

export const BookingModel = model<IBooking>("Booking", bookingSchema)

// ── Payment ──────────────────────────────────────────────────────────

export interface IPayment extends Timestamps {
  _id: Types.ObjectId
  delegateId: Types.ObjectId
  provider: "manual" | "paystack"
  /** Unique per provider transaction. The idempotency key for confirmation. */
  reference: string
  amount: number
  status: PaymentStatus
  receiptUrl: string | null
  receiptPublicId: string | null
  note: string
  verifiedByUserId: Types.ObjectId | null
  verifiedAt: Date | null
  // Server-side reconciliation state — see lib/payments.ts
  attempts: number
  nextRetryAt: Date | null
  lastError: string | null
  rawResponse: Record<string, unknown> | null
}

const paymentSchema = new Schema<IPayment>(
  {
    delegateId: { type: Schema.Types.ObjectId, ref: "Delegate", required: true },
    provider: { type: String, enum: ["manual", "paystack"], required: true },
    reference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    receiptUrl: { type: String, default: null },
    receiptPublicId: { type: String, default: null },
    note: { type: String, default: "" },

    verifiedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },

    attempts: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    rawResponse: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
)

paymentSchema.index({ delegateId: 1, status: 1 })
// Drives the cron's atomic claim query.
paymentSchema.index({ status: 1, provider: 1, nextRetryAt: 1 })
// The payments queue lists newest-first within a status.
paymentSchema.index({ status: 1, createdAt: -1 })

export const PaymentModel = model<IPayment>("Payment", paymentSchema)

// ── PastoralSession ──────────────────────────────────────────────────

export interface IPastoralSession extends Timestamps {
  _id: Types.ObjectId
  delegateId: Types.ObjectId
  pastorId: Types.ObjectId
  status: PastoralStatus
  notes: string
  seenAt: Date | null
}

const pastoralSessionSchema = new Schema<IPastoralSession>(
  {
    delegateId: { type: Schema.Types.ObjectId, ref: "Delegate", required: true },
    pastorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: PASTORAL_STATUSES, default: "pending" },
    notes: { type: String, default: "" },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true }
)

pastoralSessionSchema.index({ delegateId: 1, pastorId: 1 }, { unique: true })
pastoralSessionSchema.index({ pastorId: 1, status: 1 })

export const PastoralSessionModel = model<IPastoralSession>(
  "PastoralSession",
  pastoralSessionSchema
)

// ── Assignment (audit trail) ─────────────────────────────────────────

export interface IAssignment extends Timestamps {
  _id: Types.ObjectId
  delegateId: Types.ObjectId
  role: "sub_admin" | "pastor"
  fromUserId: Types.ObjectId | null
  toUserId: Types.ObjectId
  mode: "auto" | "manual"
  reason: string
  actorUserId: Types.ObjectId | null
}

const assignmentSchema = new Schema<IAssignment>(
  {
    delegateId: { type: Schema.Types.ObjectId, ref: "Delegate", required: true },
    role: { type: String, enum: ["sub_admin", "pastor"], required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: ["auto", "manual"], required: true },
    reason: { type: String, default: "" },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

assignmentSchema.index({ delegateId: 1, createdAt: -1 })

export const AssignmentModel = model<IAssignment>("Assignment", assignmentSchema)

// ── ImportBatch ──────────────────────────────────────────────────────

export interface IImportBatch extends Timestamps {
  _id: Types.ObjectId
  actorUserId: Types.ObjectId
  sourceType: "upload" | "sheet_url"
  sourceLabel: string
  mapping: Record<string, string>
  rowsTotal: number
  rowsImported: number
  rowsDuplicate: number
  rowsInvalid: number
  assignToUserId: Types.ObjectId | null
  rolledBackAt: Date | null
}

const importBatchSchema = new Schema<IImportBatch>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sourceType: { type: String, enum: ["upload", "sheet_url"], required: true },
    sourceLabel: { type: String, default: "" },
    mapping: { type: Schema.Types.Mixed, default: {} },
    rowsTotal: { type: Number, default: 0 },
    rowsImported: { type: Number, default: 0 },
    rowsDuplicate: { type: Number, default: 0 },
    rowsInvalid: { type: Number, default: 0 },
    assignToUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rolledBackAt: { type: Date, default: null },
  },
  { timestamps: true }
)

importBatchSchema.index({ actorUserId: 1, createdAt: -1 })
importBatchSchema.index({ createdAt: -1 })

export const ImportBatchModel = model<IImportBatch>("ImportBatch", importBatchSchema)

// ── ActivityLog ──────────────────────────────────────────────────────

export interface IActivityLog extends Timestamps {
  _id: Types.ObjectId
  actorUserId: Types.ObjectId | null
  action: string
  entityType: string
  entityId: string | null
  details: Record<string, unknown>
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

activityLogSchema.index({ createdAt: -1 })
activityLogSchema.index({ entityType: 1, entityId: 1 })

export const ActivityLogModel = model<IActivityLog>("ActivityLog", activityLogSchema)

// ── SiteContent ──────────────────────────────────────────────────────
// One document per editable page section. `blocks` is the ordered widget list
// the CMS editor writes and the public pages render.

export interface ISiteBlock {
  id: string
  type: string
  props: Record<string, unknown>
  visible: boolean
}

export interface ISiteContent extends Timestamps {
  _id: Types.ObjectId
  slug: string
  blocks: ISiteBlock[]
  /** Draft edits are kept apart until the super admin publishes. */
  draftBlocks: ISiteBlock[] | null
  publishedAt: Date | null
  updatedByUserId: Types.ObjectId | null
}

const siteBlockSchema = new Schema<ISiteBlock>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    props: { type: Schema.Types.Mixed, default: {} },
    visible: { type: Boolean, default: true },
  },
  { _id: false }
)

const siteContentSchema = new Schema<ISiteContent>(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    blocks: { type: [siteBlockSchema], default: [] },
    draftBlocks: { type: [siteBlockSchema], default: null },
    publishedAt: { type: Date, default: null },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

export const SiteContentModel = model<ISiteContent>("SiteContent", siteContentSchema)

// ── FormField ────────────────────────────────────────────────────────
// The editable registration form. Built-in fields mirror real Delegate
// columns; custom ones land in `Delegate.customFields`.

export interface IFormField extends Timestamps {
  _id: Types.ObjectId
  key: string
  label: string
  type: string
  step: string
  required: boolean
  placeholder: string
  helpText: string
  options: string[]
  order: number
  isActive: boolean
  isBuiltIn: boolean
  isLocked: boolean
}

const formFieldSchema = new Schema<IFormField>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    step: { type: String, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    helpText: { type: String, default: "" },
    options: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isBuiltIn: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
  },
  { timestamps: true }
)

formFieldSchema.index({ step: 1, order: 1 })

export const FormFieldModel = model<IFormField>("FormField", formFieldSchema)

// ── Counter ──────────────────────────────────────────────────────────
// Atomic sequence source for LFF IDs and accommodation codes.

export interface ICounter {
  _id: string
  value: number
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  value: { type: Number, default: 0 },
})

export const CounterModel = model<ICounter>("Counter", counterSchema)
