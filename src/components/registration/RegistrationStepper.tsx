"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight, Building2, Check, CreditCard, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Field } from "@/components/registration/Field"
import { cn } from "@/lib/utils"

import {
  ADDITIONAL_SERVICES,
  COMING_WITH_OPTIONS,
  EVENT,
  GENDERS,
  companionStepFor,
  familyMemberCount,
  formatNaira,
  type AdditionalServiceId,
} from "@/lib/constants"
import { quote } from "@/lib/pricing"
import type { AccommodationOption } from "@/lib/accommodation"
import {
  registrationSchema,
  STEP_FIELDS,
  type RegistrationInput,
} from "@/lib/registration-schema"
import { submitRegistration } from "@/actions/registration.actions"
import { initializePayment } from "@/actions/payment.actions"
import { BlockRenderer, type PricingRow } from "@/components/cms/BlockRenderer"
import { CustomFieldInputs, type CustomAnswers } from "@/components/registration/CustomFieldInputs"
import type { Block } from "@/lib/cms-blocks"
import type { FormFieldConfig } from "@/lib/form-fields"

const DRAFT_KEY = `lff-registration-draft:${EVENT.tag}`

type StepId =
  | "welcome"
  | "fees"
  | "personal"
  | "comingWith"
  | "partner"
  | "family"
  | "accommodation"
  | "feeding"
  | "services"
  | "payment"

const STEP_TITLES: Record<StepId, string> = {
  welcome: "Welcome",
  fees: "Fees",
  personal: "Personal data",
  comingWith: "Who are you coming with?",
  partner: "Spouse / friend / sibling",
  family: "Family members",
  accommodation: "Accommodation",
  feeding: "Feeding",
  services: "Additional services",
  payment: "Payment",
}

const EMPTY: RegistrationInput = {
  fullName: "",
  whatsappNumber: "",
  phoneNumber: "",
  email: "",
  gender: undefined,
  comingWith: undefined as unknown as RegistrationInput["comingWith"],
  partnerFullName: "",
  partnerPhone: "",
  partnerWhatsapp: "",
  partnerGender: undefined,
  familyMember1: "",
  familyMember2: "",
  familyMember3: "",
  accommodationId: "",
  comments: "",
  additionalServices: [],
  paidRetreatConsent: undefined as unknown as true,
}

export type PayMethod = "paystack" | "transfer"

export function RegistrationStepper({
  accommodations,
  content,
  customFields,
  paystackEnabled,
}: {
  accommodations: AccommodationOption[]
  /** Whether online checkout can be offered at all. */
  paystackEnabled: boolean
  /** CMS blocks per section slug — the editable copy on each step. */
  content: Record<string, Block[]>
  /** Super-admin-defined questions, grouped by the step they belong to. */
  customFields: Record<string, FormFieldConfig[]>
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  // Custom fields are defined at runtime, so their answers live outside
  // react-hook-form and are validated server-side against the same records.
  const [custom, setCustom] = useState<CustomAnswers>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<{
    lffPending: true
    accommodationName: string
    totalDue: number
    delegateId: string
  } | null>(null)
  // How the delegate said they will pay. Only decides what happens after the
  // registration is saved — the registration itself is identical either way.
  const [payMethod, setPayMethod] = useState<PayMethod>(paystackEnabled ? "paystack" : "transfer")

  const form = useForm<RegistrationInput>({
    resolver: zodResolver(registrationSchema) as unknown as Resolver<RegistrationInput>,
    defaultValues: EMPTY,
    mode: "onTouched",
  })

  const values = form.watch()

  const pricingRows: PricingRow[] = accommodations.map((option) => ({
    id: option.id,
    name: option.name,
    description: option.description,
    pricePerPerson: option.pricePerPerson,
    pricingMode: option.pricingMode,
    isFree: option.isFree,
    bedsAvailable: option.bedsAvailable,
  }))

  function setCustomValue(key: string, value: unknown) {
    setCustom((prev) => ({ ...prev, [key]: value }))
    setCustomErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Restore a draft so a long form survives an accidental refresh.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY)
      if (saved) {
        form.reset({ ...EMPTY, ...JSON.parse(saved) })
      }
    } catch {
      // A corrupt or blocked draft is not worth surfacing — start clean.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (done) return
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values))
    } catch {
      // Private mode / blocked storage — the form still works without a draft.
    }
  }, [values, done])

  const branch = companionStepFor(values.comingWith)

  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = ["welcome", "fees", "personal", "comingWith"]
    if (branch === "partner") base.push("partner")
    if (branch === "family") base.push("family")
    return [...base, "accommodation", "feeding", "services", "payment"]
  }, [branch])

  // Dropping a branch step (e.g. switching to "Just me") can leave us past the end.
  const safeIndex = Math.min(stepIndex, steps.length - 1)
  const step = steps[safeIndex]

  const selectedAccommodation =
    accommodations.find((option) => option.id === values.accommodationId) ?? null

  const priced = quote({
    accommodation: selectedAccommodation,
    comingWith: values.comingWith,
    additionalServices: (values.additionalServices ?? []) as AdditionalServiceId[],
  })

  async function goNext() {
    const fields = STEP_FIELDS[step as keyof typeof STEP_FIELDS] as
      | readonly (keyof RegistrationInput)[]
      | undefined

    if (fields) {
      const valid = await form.trigger(fields as never)
      if (!valid) return
    }

    if (safeIndex < steps.length - 1) {
      setStepIndex(safeIndex + 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  function goBack() {
    if (safeIndex > 0) {
      setStepIndex(safeIndex - 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true)
    try {
      const result = await submitRegistration({ ...data, customFields: custom })

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [name, messages] of Object.entries(result.fieldErrors)) {
            if (messages?.[0]) {
              form.setError(name as keyof RegistrationInput, { message: messages[0] })
            }
          }
        }
        // Custom-field errors cannot go through setError — those names are not
        // part of the typed schema — so they are tracked separately.
        setCustomErrors(result.customFieldErrors ?? {})
        toast.error(result.error)
        return
      }

      window.localStorage.removeItem(DRAFT_KEY)

      // The registration is saved at this point. Whatever happens with the
      // payment provider next must not throw that away, so the confirmation
      // state is set first and the handoff is attempted after it.
      setDone({
        lffPending: true,
        accommodationName: result.accommodationName,
        totalDue: result.totalDue,
        delegateId: result.delegateId,
      })

      if (payMethod === "paystack" && paystackEnabled && result.totalDue > 0) {
        const checkout = await initializePayment({ delegateId: result.delegateId })

        if (checkout.ok) {
          window.location.href = checkout.authorizationUrl
          return
        }

        // Paystack unreachable, or nothing owed. Fall through to the
        // confirmation screen, which offers both paying online and a transfer.
        toast.error(`${checkout.error} Your registration is saved.`)
      }

      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (error) {
      console.error(error)
      toast.error("Something went wrong submitting your registration. Please try again.")
    } finally {
      setSubmitting(false)
    }
  })

  if (done) {
    return (
      <SubmittedPanel {...done} email={values.email} paystackEnabled={paystackEnabled} />
    )
  }

  const progress = ((safeIndex + 1) / steps.length) * 100

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Step {safeIndex + 1} of {steps.length}
          </p>
          {priced.total > 0 ? (
            <p className="text-sm font-semibold tabular-nums">{formatNaira(priced.total)}</p>
          ) : null}
        </div>
        <Progress value={progress} className="mt-3 h-1.5" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{STEP_TITLES[step]}</h1>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-6">
          {step === "welcome" ? (
            <BlockRenderer blocks={content["register.welcome"] ?? []} context={{ pricing: pricingRows }} />
          ) : null}
          {step === "fees" ? (
            <BlockRenderer blocks={content["register.fees"] ?? []} context={{ pricing: pricingRows }} />
          ) : null}
          {step === "personal" ? <PersonalStep form={form} /> : null}
          {step === "comingWith" ? <ComingWithStep form={form} /> : null}
          {step === "partner" ? <PartnerStep form={form} /> : null}
          {step === "family" ? <FamilyStep form={form} /> : null}
          {step === "accommodation" ? (
            <AccommodationStep form={form} accommodations={accommodations} />
          ) : null}
          {step === "feeding" ? (
            <FeedingStep form={form} content={content["register.feeding"] ?? []} />
          ) : null}
          {step === "services" ? <ServicesStep form={form} /> : null}
          {step === "payment" ? (
            <PaymentStep
              form={form}
              priced={priced}
              payMethod={payMethod}
              onPayMethodChange={setPayMethod}
              paystackEnabled={paystackEnabled}
            />
          ) : null}

          {/* Whatever the super admin added to this step, appended after the
              built-in questions. */}
          {(customFields[step] ?? []).length > 0 ? (
            <div className="space-y-5 border-t pt-5">
              <CustomFieldInputs
                fields={customFields[step] ?? []}
                values={custom}
                errors={customErrors}
                onChange={setCustomValue}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-10 flex items-center justify-between gap-3 border-t pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={safeIndex === 0 || submitting}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>

          {step === "payment" ? (
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {payMethod === "paystack" ? "Opening checkout…" : "Submitting…"}
                </>
              ) : payMethod === "paystack" && paystackEnabled && priced.total > 0 ? (
                <>
                  Pay {formatNaira(priced.total)} <CreditCard className="size-4" />
                </>
              ) : (
                <>
                  Submit registration <Check className="size-4" />
                </>
              )}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={goNext}>
              Next <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────

type StepForm = { form: ReturnType<typeof useForm<RegistrationInput>> }

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
}

function WelcomeStep() {
  return (
    <Prose>
      <p className="text-base text-foreground">
        Welcome to the official registration and accommodation booking portal for the{" "}
        <strong>{EVENT.shortName}</strong> — a life-transforming spiritual encounter you don’t
        want to miss.
      </p>

      <dl className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
        <Fact label="Date">{EVENT.dateLabel}</Fact>
        <Fact label="Venue">{EVENT.venue}</Fact>
        <Fact label="Host">{EVENT.host}</Fact>
        <Fact label="Starts">{EVENT.startTimeLabel}</Fact>
      </dl>

      <div>
        <h2 className="font-semibold text-foreground">Arrival and departure</h2>
        <p className="mt-1">
          Participants travelling from distant locations may arrive from Friday, 2nd October
          2026. The retreat concludes on Sunday, 4th October 2026.
        </p>
      </div>

      <div>
        <h2 className="font-semibold text-foreground">Who can register?</h2>
        <p className="mt-1">
          Everyone is welcome — whether it is your first time or you have attended before. Come
          expecting divine encounters and lasting transformation.
        </p>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Fill each section carefully and submit only once. Once submitted, our team receives your
        details for processing.
      </p>
    </Prose>
  )
}

function FeesStep({ accommodations }: { accommodations: AccommodationOption[] }) {
  return (
    <Prose>
      <p>
        Below are the {EVENT.shortName} costs based on the accommodation chosen. Any of these
        costs covers registration, feeding and accommodation for each participant.
      </p>

      <ul className="divide-y rounded-lg border">
        {accommodations.map((option) => (
          <li key={option.id} className="flex items-center justify-between gap-4 p-3.5">
            <span className="text-sm font-medium text-foreground">{option.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {option.isFree ? "Free" : formatNaira(option.pricePerPerson)}
              {option.pricingMode === "per_person" && !option.isFree ? (
                <span className="font-normal text-muted-foreground"> each</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">Payment &amp; accommodation notice</p>
        <p className="mt-1">
          Accommodation reservations are confirmed strictly based on payment proof, and
          allocation is on a first-pay, first-serve basis.
        </p>
        <p className="mt-2">
          If you are attending with your spouse and staying in hostel or private accommodation,
          each individual must pay their own {formatNaira(35_000)} fee — shared accommodation
          does not reduce the cost per person.
        </p>
      </div>
    </Prose>
  )
}

function PersonalStep({ form }: StepForm) {
  const { register, formState, control } = form
  const errors = formState.errors

  return (
    <>
      <Field label="Full names" htmlFor="fullName" required error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" {...register("fullName")} />
      </Field>

      <Field
        label="WhatsApp number"
        htmlFor="whatsappNumber"
        required
        error={errors.whatsappNumber?.message}
      >
        <Input id="whatsappNumber" inputMode="tel" autoComplete="tel" {...register("whatsappNumber")} />
      </Field>

      <Field label="Phone number" htmlFor="phoneNumber" required error={errors.phoneNumber?.message}>
        <Input id="phoneNumber" inputMode="tel" autoComplete="tel" {...register("phoneNumber")} />
      </Field>

      <Field label="Email" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </Field>

      <Controller
        control={control}
        name="gender"
        render={({ field }) => (
          <Field label="Gender" error={errors.gender?.message}>
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={field.onChange}
              className="flex gap-6"
            >
              {GENDERS.map((gender) => (
                <div key={gender} className="flex items-center gap-2">
                  <RadioGroupItem value={gender} id={`gender-${gender}`} />
                  <Label htmlFor={`gender-${gender}`} className="font-normal">
                    {gender}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </Field>
        )}
      />
    </>
  )
}

function ComingWithStep({ form }: StepForm) {
  const { control, formState } = form

  return (
    <Controller
      control={control}
      name="comingWith"
      render={({ field }) => (
        <Field
          label="Who are you coming with?"
          required
          error={formState.errors.comingWith?.message}
          hint="If you are coming alone, choose “Just me” and we will take you straight to accommodation."
        >
          <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="gap-2">
            {COMING_WITH_OPTIONS.map((option) => (
              <Label
                key={option}
                htmlFor={`coming-${option}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors",
                  field.value === option ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <RadioGroupItem value={option} id={`coming-${option}`} className="mt-0.5" />
                <span className="text-sm leading-relaxed">{option}</span>
              </Label>
            ))}
          </RadioGroup>
        </Field>
      )}
    />
  )
}

function PartnerStep({ form }: StepForm) {
  const { register, control, formState, watch } = form
  const errors = formState.errors
  const isSpouse = watch("comingWith") === "My spouse"
  const who = isSpouse ? "spouse" : "friend / sibling"

  return (
    <>
      <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        This section registers your {who} only. Please fill it in if you are attending with your
        spouse, or a friend or sibling of the same sex as you.
      </p>

      <Field
        label={`Full names of ${who}`}
        htmlFor="partnerFullName"
        required
        error={errors.partnerFullName?.message}
      >
        <Input id="partnerFullName" {...register("partnerFullName")} />
      </Field>

      <Field label={`Phone number of ${who}`} htmlFor="partnerPhone" error={errors.partnerPhone?.message}>
        <Input id="partnerPhone" inputMode="tel" {...register("partnerPhone")} />
      </Field>

      <Field
        label={`WhatsApp number of ${who}`}
        htmlFor="partnerWhatsapp"
        error={errors.partnerWhatsapp?.message}
      >
        <Input id="partnerWhatsapp" inputMode="tel" {...register("partnerWhatsapp")} />
      </Field>

      <Controller
        control={control}
        name="partnerGender"
        render={({ field }) => (
          <Field label={`Gender of ${who}`} error={errors.partnerGender?.message}>
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={field.onChange}
              className="flex gap-6"
            >
              {GENDERS.map((gender) => (
                <div key={gender} className="flex items-center gap-2">
                  <RadioGroupItem value={gender} id={`partner-gender-${gender}`} />
                  <Label htmlFor={`partner-gender-${gender}`} className="font-normal">
                    {gender}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </Field>
        )}
      />
    </>
  )
}

function FamilyStep({ form }: StepForm) {
  const { register, formState, watch } = form
  const errors = formState.errors
  const count = familyMemberCount(watch("comingWith"))
  const fields = ["familyMember1", "familyMember2", "familyMember3"] as const

  return (
    <>
      <p className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        Fill this section only if you are a family of {count + 1} that wants to stay together.
        Do not include yourself — you are already registered above.
      </p>

      {fields.slice(0, count).map((name, index) => (
        <Field
          key={name}
          label={`Full name and gender of family member ${index + 1}`}
          htmlFor={name}
          required
          error={errors[name]?.message}
          hint="For example: Grace Olaiya, Female"
        >
          <Input id={name} {...register(name)} />
        </Field>
      ))}
    </>
  )
}

function AccommodationStep({
  form,
  accommodations,
}: StepForm & { accommodations: AccommodationOption[] }) {
  const { control, formState, watch } = form
  const partySize = quote({
    accommodation: null,
    comingWith: watch("comingWith"),
    additionalServices: [],
  }).partySize

  return (
    <Controller
      control={control}
      name="accommodationId"
      render={({ field }) => (
        <Field
          label="Please make your selection below"
          required
          error={formState.errors.accommodationId?.message}
          hint="All costs include feeding, accommodation and registration for the entire period of the Sorting Out."
        >
          <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="gap-2">
            {accommodations.map((option) => {
              const bedsNeeded = option.pricingMode === "flat" ? option.capacityPerUnit : partySize
              const soldOut = option.bedsAvailable < bedsNeeded
              const total =
                option.isFree
                  ? 0
                  : option.pricingMode === "per_person"
                    ? option.pricePerPerson * partySize
                    : option.pricePerPerson

              return (
                <Label
                  key={option.id}
                  htmlFor={`acc-${option.id}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors",
                    soldOut && "cursor-not-allowed opacity-55",
                    field.value === option.id ? "border-primary bg-primary/5" : !soldOut && "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem
                    value={option.id}
                    id={`acc-${option.id}`}
                    disabled={soldOut}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{option.name}</span>
                      {soldOut ? (
                        <Badge variant="secondary">Fully booked</Badge>
                      ) : option.bedsAvailable <= 10 ? (
                        <Badge variant="outline">{option.bedsAvailable} left</Badge>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-sm font-semibold tabular-nums text-foreground">
                      {option.isFree ? "Free" : formatNaira(total)}
                      {!option.isFree && option.pricingMode === "per_person" && partySize > 1 ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          ({formatNaira(option.pricePerPerson)} × {partySize})
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
        </Field>
      )}
    />
  )
}

function FeedingStep({ form, content }: StepForm & { content: Block[] }) {
  return (
    <>
      <BlockRenderer blocks={content} />

      <Field label="Comments if any" htmlFor="comments" error={form.formState.errors.comments?.message}>
        <Textarea id="comments" rows={4} {...form.register("comments")} />
      </Field>
    </>
  )
}

function ServicesStep({ form }: StepForm) {
  const { control } = form

  return (
    <Controller
      control={control}
      name="additionalServices"
      render={({ field }) => {
        const selected = new Set(field.value ?? [])

        return (
          <Field
            label="Additional services"
            hint="Optional. Tick any extra service you might need."
          >
            <div className="space-y-2">
              {ADDITIONAL_SERVICES.map((service) => (
                <Label
                  key={service.id}
                  htmlFor={`service-${service.id}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors",
                    selected.has(service.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    id={`service-${service.id}`}
                    checked={selected.has(service.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selected)
                      if (checked) next.add(service.id)
                      else next.delete(service.id)
                      field.onChange([...next])
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-foreground">{service.name}</span>
                    <span className="mt-0.5 block text-sm tabular-nums text-muted-foreground">
                      {formatNaira(service.price)}
                    </span>
                  </span>
                </Label>
              ))}
            </div>
          </Field>
        )
      }}
    />
  )
}

function PaymentStep({
  form,
  priced,
  payMethod,
  onPayMethodChange,
  paystackEnabled,
}: StepForm & {
  priced: ReturnType<typeof quote>
  payMethod: PayMethod
  onPayMethodChange: (method: PayMethod) => void
  paystackEnabled: boolean
}) {
  const { control, formState } = form

  return (
    <>
      <div className="rounded-lg border">
        <p className="border-b px-4 py-3 text-sm font-semibold">Your total</p>
        <ul className="divide-y">
          {priced.lines.map((line, index) => (
            <li key={index} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="text-sm">
                {line.label}
                {line.detail ? (
                  <span className="text-muted-foreground"> — {line.detail}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm tabular-nums">{formatNaira(line.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-4 border-t bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold">Total due</span>
          <span className="text-base font-semibold tabular-nums">{formatNaira(priced.total)}</span>
        </div>
      </div>

      {paystackEnabled && priced.total > 0 ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">How would you like to pay?</legend>

          <PayOption
            checked={payMethod === "paystack"}
            onSelect={() => onPayMethodChange("paystack")}
            icon={<CreditCard className="size-4" />}
            title="Pay now online"
            description="Card, bank transfer or USSD through Paystack. Your place is reserved as soon as the payment goes through."
          />

          <PayOption
            checked={payMethod === "transfer"}
            onSelect={() => onPayMethodChange("transfer")}
            icon={<Building2 className="size-4" />}
            title="Pay by bank transfer"
            description="Transfer to the account below and send your receipt. A sub-admin confirms it by hand."
          />
        </fieldset>
      ) : null}

      {payMethod === "transfer" || !paystackEnabled || priced.total === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-semibold">Transfer to</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Account name">{EVENT.bank.accountName}</Row>
            <Row label="Account number">
              <span className="font-mono font-semibold">{EVENT.bank.accountNumber}</span>
            </Row>
            <Row label="Bank">{EVENT.bank.bankName}</Row>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Screenshot or save this page if you are not paying immediately. After submitting you
            can upload your proof of payment, or pay online by card. Accommodation is reserved
            only once payment is confirmed.
          </p>
        </div>
      ) : null}

      <Controller
        control={control}
        name="paidRetreatConsent"
        render={({ field }) => (
          <Field label="Confirmation" required error={formState.errors.paidRetreatConsent?.message}>
            <Label
              htmlFor="consent"
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal"
            >
              <Checkbox
                id="consent"
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true ? true : undefined)}
                className="mt-0.5"
              />
              <span className="text-sm">I understand that this is a paid retreat.</span>
            </Label>
          </Field>
        )}
      />
    </>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** A selectable payment method, styled like the accommodation options. */
function PayOption({
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  checked: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      <input
        type="radio"
        name="payMethod"
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 accent-primary"
      />
      <span className="flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SubmittedPanel({
  accommodationName,
  totalDue,
  email,
  delegateId,
  paystackEnabled,
}: {
  accommodationName: string
  totalDue: number
  email?: string
  delegateId: string
  paystackEnabled: boolean
}) {
  const [paying, setPaying] = useState(false)

  // Someone who chose a transfer — or whose checkout failed — can still pay
  // online from here without going hunting for the status page.
  async function payOnline() {
    setPaying(true)
    try {
      const result = await initializePayment({ delegateId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.location.href = result.authorizationUrl
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="size-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Registration received</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Thank you. We have your details{email ? ` and sent a confirmation to ${email}` : ""}. Your
        selection is <strong className="text-foreground">{accommodationName}</strong>, and{" "}
        <strong className="text-foreground">{formatNaira(totalDue)}</strong> is due.
      </p>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        Your place is <strong>not reserved</strong> until your payment is confirmed. Allocation is
        first-pay, first-serve. Once a sub-admin confirms your payment you will receive your LFF
        ID and accommodation code by email.
      </div>

      <div className="mt-6 rounded-lg border bg-muted/40 p-4">
        <p className="text-sm font-semibold">Transfer to</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Account name">{EVENT.bank.accountName}</Row>
          <Row label="Account number">
            <span className="font-mono font-semibold">{EVENT.bank.accountNumber}</span>
          </Row>
          <Row label="Bank">{EVENT.bank.bankName}</Row>
        </dl>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        {paystackEnabled && totalDue > 0 ? (
          <Button size="lg" onClick={payOnline} disabled={paying}>
            {paying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Pay {formatNaira(totalDue)} online
          </Button>
        ) : null}

        <a href="/status" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Upload proof of payment
        </a>
      </div>
    </div>
  )
}
