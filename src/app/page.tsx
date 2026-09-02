import Link from "next/link"
import { ArrowRight, CalendarDays, MapPin, UserRound } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { EVENT, formatNaira } from "@/lib/constants"
import { Logo } from "@/components/Logo"

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="border-b bg-slate-950 text-slate-50">
        <div className="mx-auto w-full max-w-3xl px-6 py-20">
          <Logo width={72} onDark priority />
          <p className="mt-7 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Registration is open
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">{EVENT.name}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
            A life-transforming spiritual encounter. Everyone is welcome — whether it is your
            first time or you have attended before.
          </p>

          <dl className="mt-9 grid gap-4 sm:grid-cols-3">
            <Detail icon={<CalendarDays className="size-4" />} label="Date">
              {EVENT.dateLabel}
            </Detail>
            <Detail icon={<MapPin className="size-4" />} label="Venue">
              {EVENT.venue}
            </Detail>
            <Detail icon={<UserRound className="size-4" />} label="Host">
              {EVENT.host}
            </Detail>
          </dl>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Register now <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/status"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "border-slate-700 bg-transparent text-slate-100 hover:bg-slate-900 hover:text-slate-50",
              })}
            >
              Check my status
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 py-14">
        <h2 className="text-xl font-semibold">Before you register</h2>
        <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            General registration, which includes hostel accommodation, is{" "}
            <strong className="text-foreground">{formatNaira(35_000)}</strong>. Other
            accommodation options and rates are shown during registration.
          </li>
          <li>
            Every cost covers registration, feeding and accommodation for the full duration of
            the retreat.
          </li>
          <li>
            Installment payments are accepted, but the full amount must be paid before the
            retreat.
          </li>
          <li>
            Accommodation is reserved <strong className="text-foreground">only</strong> once your
            payment is confirmed. Allocation is first-pay, first-serve.
          </li>
          <li>
            Feeding is once daily, as delegates are expected to be on a fast. If a medical
            condition prevents you fasting, say so in the comments and bring your own snacks.
          </li>
        </ul>

        <p className="mt-8 text-sm text-muted-foreground">
          Questions? Call or WhatsApp{" "}
          <a className="font-medium text-foreground underline" href={`tel:${EVENT.supportPhone.replace(/\s/g, "")}`}>
            {EVENT.supportPhone}
          </a>
          .
        </p>
      </section>
    </main>
  )
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-slate-100">{children}</dd>
    </div>
  )
}
