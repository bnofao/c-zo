# B10 — SMTP transport for `EmailService` (design)

**Date:** 2026-06-06
**Branch:** `feat/b10-smtp-email`
**Backlog item:** B10 — SMTP/SES drop-in for `EmailService` (sole remaining prod blocker)

## Problem

`@czo/kit/email` exposes a transport-only `EmailService` Tag and a dev/test
`loggingLayer`. The auth account subscribers (password-reset, email-verification,
sign-up, change-email, account-deleted) probe `EmailService` via
`Effect.serviceOption` and **skip + log** when no transport is provided. No real
transport exists, and `apps/life/main.ts` merges none — so in production every
auth email is silently dropped. This blocks production auth.

## Goal

Ship a real SMTP transport (nodemailer) as a drop-in `EmailService` layer,
selectable via env, wired into `apps/life`, with unit + integration coverage.
SES and other transports are explicitly **out of scope** (SMTP via nodemailer
already covers SES through its SMTP interface; a native SES SDK layer is deferred).

## Architecture

### New subpath: `@czo/kit/email/smtp`

The base `@czo/kit/email` (index) is **unchanged**: it keeps the `EmailService`
Tag, `SendEmailInput`, `EmailSendFailed`, and `loggingLayer`, and gains **no**
nodemailer dependency — so `@czo/auth` (which imports only the Tag) never pulls
nodemailer into its build/test graph.

The new `src/email/smtp.ts` (exported as `@czo/kit/email/smtp`) provides:

- **`emailServiceFromTransporter(transporter, defaultFrom)`** — a pure factory
  returning the `EmailService` impl. Maps `SendEmailInput → transporter.sendMail`
  (`from: input.from ?? defaultFrom`, `to`, `subject`, `html`, `text`), wrapping
  the promise in `Effect.tryPromise` and mapping rejection → `EmailSendFailed({ cause })`.
  This is the test seam (decouples message mapping from Config reading and the
  real transporter).

- **`smtpLayer: Layer<EmailService, ConfigError, Scope>`** — reads the SMTP Config
  (below), creates a **pooled** nodemailer transporter via
  `Effect.acquireRelease` (released with `transporter.close()` on scope close),
  and yields `emailServiceFromTransporter(transporter, EMAIL_FROM)`.

- **`fromEnv: Layer<EmailService, ConfigError>`** — reads `EMAIL_TRANSPORT`
  (`logging | smtp`, default `logging`) and returns `loggingLayer` or `smtpLayer`
  via `Layer.unwrapEffect`. This is the layer the host app merges.

### Config (Effect `Config`)

Read inside `smtpLayer` / `fromEnv` (consistent with the module Config pattern;
no `process.env` reads in library code):

| Var | Type | Default | Notes |
|-----|------|---------|-------|
| `EMAIL_TRANSPORT` | `logging` \| `smtp` | `logging` | read in `fromEnv` |
| `SMTP_HOST` | string | — | required when `smtp` |
| `SMTP_PORT` | number | `587` | |
| `SMTP_SECURE` | boolean | `false` | `true` for implicit TLS (465) |
| `SMTP_USER` | string | — (optional) | |
| `SMTP_PASSWORD` | redacted string | — (optional) | `auth: { user, pass }` set **only if both** present (IP-allowlisted relays need none) |
| `EMAIL_FROM` | string | — | required when `smtp`; default sender when `input.from` is absent |

A missing required var when `EMAIL_TRANSPORT=smtp` surfaces as a `ConfigError` at
boot (fail-fast), which is the desired behavior.

### `buildApp` host-services injection (kit change — shared infra)

`BuildAppOptions` gains:

```ts
readonly services?: Layer.Layer<any, unknown, never>
```

It is **`provideMerge`'d under `moduleLayers`** (alongside `DrizzleLayer`):

```ts
const moduleLayers = moduleLayersRaw.pipe(
  Layer.provideMerge(Layer.mergeAll(DrizzleLayer, options.services ?? Layer.empty)),
)
```

This is required because the auth subscriber fiber is forked with
`Effect.forkScoped` **inside** `subscribersLayer`'s build, so `serviceOption`
reads from the module layer's build context — a sibling `mergeAll` at `appLayer`
level would NOT be visible to it. Providing the host layer *under* the modules
puts `EmailService` in that context. When `services` is omitted, behavior is
unchanged (subscribers skip + log). The option is generic (`services`) so any
future host-provided cross-cutting service reuses the same seam.

### Wiring `apps/life`

`apps/life/src/main.ts` adds `services: Email.fromEnv` to its `buildApp({...})`
call (importing `fromEnv` from `@czo/kit/email/smtp`). The SMTP env vars are
documented alongside `AUTH_*`. Dev/test default (`EMAIL_TRANSPORT` unset) keeps
the logging transport, so local boots are unchanged.

## Error handling

`transporter.sendMail` rejection → `EmailSendFailed({ cause })` (the existing
tagged error). The auth subscribers already wrap each send in `runSubscriber`,
which logs failures and continues (fire-and-forget) — a transient SMTP failure
logs an error rather than crashing the app. A delivery-retry queue is **out of
scope** (it belongs to the scheduled-jobs sprint, B5/B9).

## Testing

Both levels, both run in CI (the `test` job already has Docker for Testcontainers
Postgres; Mailpit joins it).

- **Unit** — `packages/kit/src/email/smtp.test.ts`:
  - `emailServiceFromTransporter(nodemailer.createTransport({ jsonTransport: true }), 'noreply@x.test')`
    → `send(...)` → assert the captured JSON message: `to`, `subject`, `html`,
    `text`, default `from` applied, and `input.from` override honored.
  - `fromEnv` selection: `EMAIL_TRANSPORT` unset / `logging` → resolves the
    logging transport (assert no SMTP connection attempted). The `smtp` branch is
    covered by the integration test.
- **Integration** — `packages/kit/src/email/smtp.integration.test.ts`:
  - Boot Mailpit via Testcontainers `GenericContainer('axllent/mailpit')`
    (exposes SMTP `1025`, HTTP API `8025`).
  - Point `smtpLayer` Config at the mapped host/port (`SMTP_SECURE=false`,
    `EMAIL_FROM` set), `send` a message.
  - Poll Mailpit `GET /api/v1/messages` and assert the message arrived with the
    expected to/subject. Per-test timeout `120_000` (kit's default is 10s).

## Dependencies

- **kit runtime:** `nodemailer` (add to `pnpm-workspace.yaml` catalog + kit `dependencies`).
- **kit dev:** `@types/nodemailer`, `testcontainers` (base, already in catalog at
  `^11.8.0`; add as `catalog:dev` to kit — kit currently only has
  `@testcontainers/postgresql`).

## Package exports

Add to `packages/kit/package.json` `exports`:

```jsonc
"./email/smtp": {
  "types": "./src/email/smtp.ts",
  "default": "./dist/email/smtp.mjs"
}
```

(mirrors the existing `./email` entry; build config picks up the new entrypoint).

## Out of scope (deferred)

- Native SES (AWS SDK) transport — covered by SMTP-via-SES today; revisit if an
  IAM-role / no-SMTP-creds path is needed.
- Email templating (stays in the auth subscribers, as today).
- Delivery retry / dead-letter queue — scheduled-jobs sprint (B5/B9).

## Verification

- `pnpm --filter @czo/kit test src/email/` — unit + Mailpit integration green.
- `pnpm --filter @czo/kit check-types`, `pnpm --filter @czo/kit lint`.
- `pnpm --filter @czo/auth check-types` (Tag import unchanged), `pnpm --filter life check-types` (new `services` wiring).
- Manual/optional: boot `life` with `EMAIL_TRANSPORT=smtp` + a Mailpit/real relay, trigger a password-reset, confirm delivery.
