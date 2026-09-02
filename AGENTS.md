<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# LFF Sorting Out — Delegate CRM

CRM for the **October 2026 Kaduna Mega Sorting Out** retreat (2–4 Oct 2026, Alheri
Prayer Village, Kaduna). Replaces the Google Form registration with an in-app
stepper, then manages assignment, payment, accommodation and pastoral care.

## Roles

| Role | Sees |
|---|---|
| `super_admin` | Everything. Creates sub-admins and pastors, assigns roles. |
| `sub_admin` | Only delegates assigned to them. Confirms payments. |
| `pastor` | Only delegates assigned to them. Marks them pending → seen. |
| delegate | No password. Checks `/status` with LFF ID + email. |

## Conventions

- Server Actions in `src/actions/*.actions.ts` — not API routes, except webhooks,
  cron, and the import pipeline.
- Every DB call goes through `connectDB()` from `src/lib/mongoose.ts`.
- Auth/role gates come from `src/lib/permissions.ts`. Never hand-roll a role check.
- All models live in the single `src/lib/db-models.ts` barrel.
- UI is shadcn/ui in `src/components/ui/`. Don't hand-write primitives.
- Money is stored in **naira as integers**. Paystack wants kobo — convert only at
  the provider boundary in `src/lib/paystack.ts`.

## Identifiers

Minted together exactly once, when a payment is confirmed — never at registration:

- **LFF ID** — `LFF-KMS26-0007`, one global sequence.
- **Accommodation code** — `GEN-KMS26-0007`, the accommodation's `codePrefix` +
  event tag + the same sequence number.

Moving a delegate to another accommodation reissues the accommodation code and
logs it. The LFF ID never changes.

## Payments

Manual transfer + receipt upload is the primary path. Paystack is additive.
Confirmation is idempotent by reference and lives in one place —
`confirmPayment()` in `src/lib/payments.ts` — shared by the webhook and the cron.
Never poll from the client.

## Gotchas found the hard way

- **Mongoose 9 renamed `FilterQuery` to `QueryFilter`.** The old name is not
  exported at all and the error message suggests a default import, which is wrong.
- **Never use `InferSchemaType` across these schemas.** Deriving document types
  from the schemas exhausts an 8GB type-checker heap. `db-models.ts` declares
  each document interface by hand for a reason — keep it that way.
- **shadcn here is Base UI, not Radix.** `Button` takes a `render` prop, not
  `asChild`. For links, put `buttonVariants({...})` on the `<Link>` instead.
  The `form` component is not in the `base-nova` registry — use react-hook-form
  directly with `components/registration/Field.tsx`.
- **`--font-sans` must be the Geist variable name** in `layout.tsx`; shadcn's
  tokens read `--font-sans`, and a mismatch silently falls back to serif.
