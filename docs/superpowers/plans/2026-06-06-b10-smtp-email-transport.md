# B10 — SMTP Email Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real nodemailer-backed SMTP `EmailService` transport (`@czo/kit/email/smtp`), selectable via env, injected into the app runtime through a new `buildApp` host-services seam, so auth account emails (password-reset, verification, change-email) actually deliver in production.

**Architecture:** A new `@czo/kit/email/smtp` subpath exposes a pure `emailServiceFromTransporter` factory, a Config-driven `smtpLayer` (pooled, scoped), and a `fromEnv` selector (`logging` vs `smtp`). The base `@czo/kit/email` is untouched (no nodemailer dep, so auth never pulls it). `buildApp` gains a generic `services?` Layer option, `provideMerge`'d **under** the module layers (like `DrizzleLayer`) so the auth subscriber fibers (`forkScoped` + `serviceOption`) can resolve a host-provided `EmailService`. `apps/life` merges `Email.fromEnv`.

**Tech Stack:** Effect 4 (`Config`, `Layer.unwrap`, `Layer.scoped`, `Effect.acquireRelease`), nodemailer, Testcontainers (Mailpit), `@effect/vitest`.

**Spec:** `docs/superpowers/specs/2026-06-06-b10-smtp-email-transport-design.md`

> **Commit policy (project rule, overrides "frequent commits"):** Do NOT `git commit` autonomously. Each task's final step **stages** with `git add`. A single commit happens at the very end (Task 8) only after the user reviews. Branch: `feat/b10-smtp-email` (already created).

---

## File Structure

- **Create** `packages/kit/src/email/smtp.ts` — `emailServiceFromTransporter`, `smtpLayer`, `fromEnv`. Single responsibility: the SMTP transport + its env wiring.
- **Create** `packages/kit/src/email/smtp.test.ts` — unit tests (mapping + `fromEnv` selection).
- **Create** `packages/kit/src/email/smtp.integration.test.ts` — Mailpit Testcontainers delivery test.
- **Modify** `packages/kit/package.json` — add `./email/smtp` export + deps.
- **Modify** `pnpm-workspace.yaml` — add `nodemailer` / `@types/nodemailer` to the catalog.
- **Modify** `packages/kit/src/module/app.ts` — add `BuildAppOptions.services?` + `provideMerge` it under modules.
- **Modify** `packages/modules/auth/src/e2e/harness.ts` — let `bootAuthApp` accept an optional capturing `services` layer.
- **Create** `packages/modules/auth/src/e2e/email-injection.e2e.test.ts` — prove a host `EmailService` reaches an auth subscriber.
- **Modify** `apps/life/src/main.ts` — merge `Email.fromEnv` via `services`.
- **Modify** `docs/superpowers/backlog.md` — mark B10 done.

---

## Task 1: Dependencies + package export

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog block)
- Modify: `packages/kit/package.json` (exports + dependencies + devDependencies)

- [ ] **Step 1: Add nodemailer to the catalog**

In `pnpm-workspace.yaml`, under the `catalog:` map (alphabetical-ish, near other `n*`/general entries), add:

```yaml
  nodemailer: ^6.9.16
  '@types/nodemailer': ^6.4.17
```

(`testcontainers` base is already in the catalog at `^11.8.0` — do not re-add.)

- [ ] **Step 2: Add the `./email/smtp` export to kit**

In `packages/kit/package.json`, in `exports`, directly after the existing `"./email"` block, add:

```jsonc
    "./email/smtp": {
      "types": "./src/email/smtp.ts",
      "default": "./dist/email/smtp.mjs"
    },
```

- [ ] **Step 3: Add kit dependencies**

In `packages/kit/package.json`, add to `dependencies`:

```jsonc
    "nodemailer": "catalog:",
```

and to `devDependencies`:

```jsonc
    "@types/nodemailer": "catalog:",
    "testcontainers": "catalog:dev",
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: completes; `node_modules/nodemailer` now present.

- [ ] **Step 5: Verify build config picks up the new entrypoint**

Check `packages/kit/build.config.ts` (or `tsdown`/`unbuild` config). If entrypoints are listed explicitly, add `src/email/smtp.ts`. If it globs `src/**` or uses the `exports` map, no change needed.

Run: `ls packages/kit/build.config.ts && grep -n "email" packages/kit/build.config.ts || echo "no explicit entry list"`

- [ ] **Step 6: Stage**

```bash
git add pnpm-workspace.yaml packages/kit/package.json pnpm-lock.yaml
```

---

## Task 2: `emailServiceFromTransporter` (pure mapping) + unit test

**Files:**
- Create: `packages/kit/src/email/smtp.ts`
- Create: `packages/kit/src/email/smtp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kit/src/email/smtp.test.ts`:

```ts
import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import nodemailer from 'nodemailer'
import { vi } from 'vitest'
import { emailServiceFromTransporter } from './smtp'

it.effect('applies the default from when input.from is absent', () =>
  Effect.gen(function* () {
    const transporter = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(transporter, 'sendMail')
    const svc = emailServiceFromTransporter(transporter, 'noreply@czo.test')

    yield* svc.send({ to: 'u@x.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' })

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@czo.test',
      to: 'u@x.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      text: 'hi',
    }))
  }))

it.effect('honors an explicit input.from over the default', () =>
  Effect.gen(function* () {
    const transporter = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(transporter, 'sendMail')
    const svc = emailServiceFromTransporter(transporter, 'noreply@czo.test')

    yield* svc.send({ to: 'u@x.com', subject: 'Hi', html: '<p>hi</p>', from: 'custom@czo.test' })

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'custom@czo.test' }))
  }))
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @czo/kit test src/email/smtp.test.ts`
Expected: FAIL — `emailServiceFromTransporter` not exported (module `./smtp` has no such member / file missing).

- [ ] **Step 3: Implement the factory**

Create `packages/kit/src/email/smtp.ts`:

```ts
import type { Transporter } from 'nodemailer'
import type { SendEmailInput } from './index'
import { Effect } from 'effect'
import { EmailSendFailed } from './index'

/**
 * Pure factory: adapt a nodemailer `Transporter` to an `EmailService` impl.
 * Maps `SendEmailInput → transporter.sendMail`, applying `defaultFrom` when the
 * caller omits `from`, and mapping any send rejection → `EmailSendFailed`.
 * Decoupled from Config/transport creation so it can be unit-tested against an
 * in-memory transport.
 */
export function emailServiceFromTransporter(
  transporter: Transporter,
  defaultFrom: string,
): { readonly send: (input: SendEmailInput) => Effect.Effect<void, EmailSendFailed> } {
  return {
    send: input =>
      Effect.tryPromise({
        try: () => transporter.sendMail({
          from: input.from ?? defaultFrom,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        catch: cause => new EmailSendFailed({ cause }),
      }).pipe(Effect.asVoid),
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @czo/kit test src/email/smtp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/email/smtp.ts packages/kit/src/email/smtp.test.ts
```

---

## Task 3: `smtpLayer` + `fromEnv` (Config) + selection test

**Files:**
- Modify: `packages/kit/src/email/smtp.ts`
- Modify: `packages/kit/src/email/smtp.test.ts`

- [ ] **Step 1: Write the failing selection tests**

Append to `packages/kit/src/email/smtp.test.ts`:

```ts
import { afterEach } from 'vitest'
import { fromEnv } from './smtp'
import { EmailService } from './index'

const ORIGINAL_ENV = { ...process.env }
afterEach(() => { process.env = { ...ORIGINAL_ENV } })

it.effect('fromEnv defaults to the logging transport (no SMTP connection)', () =>
  Effect.gen(function* () {
    process.env.EMAIL_TRANSPORT = 'logging'
    const svc = yield* EmailService
    // logging transport just logs — send succeeds without any SMTP server.
    yield* svc.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })
  }).pipe(Effect.provide(fromEnv)))

it.effect('fromEnv with EMAIL_TRANSPORT=smtp and no SMTP_HOST fails with a ConfigError', () =>
  Effect.gen(function* () {
    process.env.EMAIL_TRANSPORT = 'smtp'
    delete process.env.SMTP_HOST
    const exit = yield* Effect.exit(
      Effect.gen(function* () { yield* EmailService }).pipe(Effect.provide(fromEnv)),
    )
    expect(exit._tag).toBe('Failure')
  }))
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @czo/kit test src/email/smtp.test.ts`
Expected: FAIL — `fromEnv` not exported.

- [ ] **Step 3: Implement `smtpLayer` + `fromEnv`**

Append to `packages/kit/src/email/smtp.ts` (and extend the top imports to:
`import { Config, Effect, Layer, Redacted } from 'effect'` and add
`import nodemailer from 'nodemailer'` and
`import { EmailSendFailed, EmailService, loggingLayer } from './index'`):

```ts
/** SMTP transport config, read from the environment via Effect `Config`. */
const smtpConfig = Effect.gen(function* () {
  const host = yield* Config.string('SMTP_HOST')
  const port = yield* Config.int('SMTP_PORT').pipe(Config.withDefault(587))
  const secure = yield* Config.boolean('SMTP_SECURE').pipe(Config.withDefault(false))
  const user = yield* Config.string('SMTP_USER').pipe(Config.withDefault(''))
  const password = yield* Config.redacted('SMTP_PASSWORD').pipe(Config.withDefault(Redacted.make('')))
  const from = yield* Config.string('EMAIL_FROM')
  return { host, port, secure, user, pass: Redacted.value(password), from }
})

/**
 * Real SMTP transport. Reads `smtpConfig`, creates a pooled nodemailer
 * transporter as a scoped resource (closed on scope release), and yields the
 * `EmailService` impl. `auth` is set only when both user and password are
 * present (some relays are IP-allowlisted and need none).
 */
export const smtpLayer: Layer.Layer<EmailService, Config.ConfigError> = Layer.unwrap(
  smtpConfig.pipe(Effect.map((cfg) => {
    const auth = cfg.user !== '' && cfg.pass !== '' ? { user: cfg.user, pass: cfg.pass } : undefined
    return Layer.scoped(
      EmailService,
      Effect.acquireRelease(
        Effect.sync(() => nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth,
          pool: true,
        })),
        transporter => Effect.sync(() => transporter.close()),
      ).pipe(Effect.map(transporter => emailServiceFromTransporter(transporter, cfg.from))),
    )
  })),
)

/**
 * Env-selected transport: `EMAIL_TRANSPORT=smtp` → `smtpLayer`, anything else
 * (default `logging`) → `loggingLayer`. This is the layer the host app merges
 * into `buildApp({ services })`.
 */
export const fromEnv: Layer.Layer<EmailService, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const transport = yield* Config.string('EMAIL_TRANSPORT').pipe(Config.withDefault('logging'))
    return transport === 'smtp' ? smtpLayer : loggingLayer
  }),
)
```

Note: remove the now-duplicate `import { EmailSendFailed } from './index'` from Task 2 — keep the single combined import line above.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @czo/kit test src/email/smtp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check + lint**

Run: `pnpm --filter @czo/kit check-types && pnpm --filter @czo/kit lint --fix`
Expected: no errors.

- [ ] **Step 6: Stage**

```bash
git add packages/kit/src/email/smtp.ts packages/kit/src/email/smtp.test.ts
```

---

## Task 4: Mailpit integration test

**Files:**
- Create: `packages/kit/src/email/smtp.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/kit/src/email/smtp.integration.test.ts`:

```ts
import type { StartedTestContainer } from 'testcontainers'
import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll } from 'vitest'
import { smtpLayer } from './smtp'
import { EmailService } from './index'

let container: StartedTestContainer
let host: string
let apiPort: number

const ORIGINAL_ENV = { ...process.env }

beforeAll(async () => {
  container = await new GenericContainer('axllent/mailpit:v1.21')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()
  host = container.getHost()
  apiPort = container.getMappedPort(8025)
  // Point smtpLayer's Config at the ephemeral Mailpit SMTP port.
  process.env.SMTP_HOST = host
  process.env.SMTP_PORT = String(container.getMappedPort(1025))
  process.env.SMTP_SECURE = 'false'
  process.env.EMAIL_FROM = 'noreply@czo.test'
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASSWORD
}, 120_000)

afterAll(async () => {
  process.env = { ...ORIGINAL_ENV }
  await container?.stop()
})

it.effect('smtpLayer delivers a message to Mailpit over real SMTP', () =>
  Effect.gen(function* () {
    const svc = yield* EmailService
    yield* svc.send({ to: 'rcpt@czo.test', subject: 'B10 hello', html: '<p>hi</p>' })

    const res = yield* Effect.promise(() => fetch(`http://${host}:${apiPort}/api/v1/messages`))
    const body = yield* Effect.promise(() =>
      res.json() as Promise<{ messages: Array<{ Subject: string }> }>)

    expect(body.messages.length).toBeGreaterThanOrEqual(1)
    expect(body.messages.some(m => m.Subject === 'B10 hello')).toBe(true)
  }).pipe(Effect.provide(smtpLayer)), 120_000)
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @czo/kit test src/email/smtp.integration.test.ts`
Expected: PASS — Mailpit boots, the message is delivered and read back via the API. (First run pulls the image; allow time.)

- [ ] **Step 3: Stage**

```bash
git add packages/kit/src/email/smtp.integration.test.ts
```

---

## Task 5: `buildApp` host-services injection

**Files:**
- Modify: `packages/kit/src/module/app.ts` (`BuildAppOptions` ~line 70; `moduleLayers` ~line 211)

- [ ] **Step 1: Add the `services?` option to `BuildAppOptions`**

In `packages/kit/src/module/app.ts`, inside `interface BuildAppOptions`, after the `db?` field, add:

```ts
  /**
   * Host-provided cross-cutting services, `provideMerge`'d UNDER the module
   * layers (alongside `DrizzleLayer`) so module subscriber fibers forked with
   * `Effect.forkScoped` can resolve them via `Effect.serviceOption`. The
   * canonical use is a real `EmailService` transport (`@czo/kit/email/smtp`
   * `fromEnv`). Omitted in dev/test → optional services stay absent and
   * subscribers skip (e.g. emails log-and-skip).
   */
  readonly services?: Layer.Layer<any, unknown, never>
```

- [ ] **Step 2: Merge it under the module layers**

Find (≈ line 211):

```ts
  const moduleLayers = moduleLayersRaw.pipe(Layer.provideMerge(DrizzleLayer))
```

Replace with:

```ts
  const moduleLayers = moduleLayersRaw.pipe(
    Layer.provideMerge(
      options.services ? Layer.mergeAll(DrizzleLayer, options.services) : DrizzleLayer,
    ),
  )
```

- [ ] **Step 3: Type-check kit**

Run: `pnpm --filter @czo/kit check-types`
Expected: no errors. (`appLayer`'s error channel already widens to `unknown` in `BuiltApp`, so the `unknown`-error `services` layer composes cleanly.)

- [ ] **Step 4: Confirm nothing else regressed in kit**

Run: `pnpm --filter @czo/kit test src/module/`
Expected: existing app/module tests pass.

- [ ] **Step 5: Stage**

```bash
git add packages/kit/src/module/app.ts
```

---

## Task 6: Auth e2e — a host `EmailService` reaches a subscriber

**Files:**
- Modify: `packages/modules/auth/src/e2e/harness.ts` (`bootAuthApp`)
- Create: `packages/modules/auth/src/e2e/email-injection.e2e.test.ts`

- [ ] **Step 1: Let `bootAuthApp` accept a capturing services layer**

In `packages/modules/auth/src/e2e/harness.ts`:

1. Ensure `Layer` is imported from `effect` (add to the existing `effect` import if absent).
2. Change the signature and the `bootTestApp` call. Find:

```ts
export async function bootAuthApp(): Promise<AuthHarness> {
```

Replace with:

```ts
export async function bootAuthApp(
  opts?: { readonly services?: Layer.Layer<any, unknown, never> },
): Promise<AuthHarness> {
```

Then find the `bootTestApp({ modules: [authModule], migrations: [AUTH_MIGRATIONS] })` call and replace with:

```ts
    bootTestApp({
      modules: [authModule],
      migrations: [AUTH_MIGRATIONS],
      ...(opts?.services ? { buildOptions: { services: opts.services } } : {}),
    })
```

(Existing callers pass no argument — backward compatible.)

- [ ] **Step 2: Write the e2e test**

Create `packages/modules/auth/src/e2e/email-injection.e2e.test.ts`:

```ts
import type { SendEmailInput } from '@czo/kit/email'
import { EmailService } from '@czo/kit/email'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Effect, Layer } from 'effect'
import { bootAuthApp } from './harness'

// Capturing transport: records every send so the test can assert the auth
// subscriber chain (SignedUp → EmailVerificationRequested → sendEmail) reached
// a host-provided EmailService injected via buildApp({ services }).
const sent: SendEmailInput[] = []
const capturingEmail = Layer.succeed(EmailService, {
  send: (input: SendEmailInput) => Effect.sync(() => { sent.push(input) }),
})

async function waitFor<T>(get: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now()
  // eslint-disable-next-line no-unmodified-loop-condition
  while (Date.now() - start < timeoutMs) {
    const v = get()
    if (v !== undefined)
      return v
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('timed out waiting for captured email')
}

describe('email injection (E2E)', () => {
  let h: Awaited<ReturnType<typeof bootAuthApp>>
  beforeAll(async () => {
    h = await bootAuthApp({ services: capturingEmail })
  }, 120_000)
  afterAll(() => h.close())

  it('delivers the sign-up verification email through the injected EmailService', async () => {
    await h.signUp('inject-me@ex.com', 'U', 'password123!')

    const verify = await waitFor(() =>
      sent.find(e => e.to === 'inject-me@ex.com' && e.subject === 'Verify your email'))

    expect(verify).toBeTruthy()
    expect(verify.html).toContain('verify-email?token=')
  })
})
```

(Add `import { describe } from 'vitest'` to the vitest import if your lint requires explicit `describe`.)

- [ ] **Step 3: Build auth dist if needed, then run**

> Cross-package boot: `bootTestApp` resolves `@czo/auth` via its alias to `src` in the auth vitest config, so no dist rebuild is required for the auth suite itself.

Run: `pnpm --filter @czo/auth test src/e2e/email-injection.e2e.test.ts`
Expected: PASS — the capturing EmailService receives the 'Verify your email' send.

- [ ] **Step 4: Confirm the rest of the auth e2e still passes (harness change is backward-compatible)**

Run: `pnpm --filter @czo/auth test src/e2e/`
Expected: all e2e suites pass.

- [ ] **Step 5: Stage**

```bash
git add packages/modules/auth/src/e2e/harness.ts packages/modules/auth/src/e2e/email-injection.e2e.test.ts
```

---

## Task 7: Wire `apps/life` + document env

**Files:**
- Modify: `apps/life/src/main.ts`

- [ ] **Step 1: Import and merge `fromEnv`**

In `apps/life/src/main.ts`:

1. Add the import near the other `@czo/kit` imports:

```ts
import * as Email from '@czo/kit/email/smtp'
```

2. In the `buildApp({ ... })` call, add the `services` field (e.g. right after `modules,`):

```ts
  // Host-provided EmailService transport. `fromEnv` reads EMAIL_TRANSPORT:
  // `smtp` → nodemailer (needs SMTP_HOST/PORT/EMAIL_FROM, optional SMTP_USER/
  // SMTP_PASSWORD/SMTP_SECURE); anything else (default) → dev logging transport.
  services: Email.fromEnv,
```

- [ ] **Step 2: Type-check the app**

Run: `pnpm --filter life check-types`
Expected: no errors.

- [ ] **Step 3: Smoke-boot with the logging default (no SMTP env)**

Run: `pnpm --filter life build` (or the app's typecheck/boot script if a full boot needs a DB). At minimum confirm `check-types` is green; a full runtime boot needs `DATABASE_URL` and is optional here.

- [ ] **Step 4: Stage**

```bash
git add apps/life/src/main.ts
```

---

## Task 8: Backlog status + full verification + single commit

**Files:**
- Modify: `docs/superpowers/backlog.md` (B10 section)

- [ ] **Step 1: Mark B10 done**

In `docs/superpowers/backlog.md`, change the B10 heading and prepend a résolu note:

```markdown
### B10. SMTP / SES drop-in pour `EmailService` — ✅ FAIT (SMTP, `feat/b10-smtp-email`)

**Résolu :** transport SMTP livré via nodemailer — `@czo/kit/email/smtp` expose `smtpLayer` (Config-driven, pooled, scopé), `fromEnv` (sélection `EMAIL_TRANSPORT` logging|smtp), et la couture pure `emailServiceFromTransporter`. `buildApp` gagne une option générique `services?` (provideMerge sous les modules) pour que l'`EmailService` hôte atteigne les fibers subscribers d'auth ; `apps/life` merge `Email.fromEnv`. Tests : unit (mapping + sélection) + intégration Mailpit (Testcontainers, en CI) + e2e auth prouvant la chaîne sign-up→email. SES (AWS SDK) reste hors-scope (SMTP couvre SES-SMTP) ; retry/dead-letter relève du sprint jobs (B5/B9).

**État (origine) :** SP5 livre `@czo/kit/email` avec `loggingLayer` (dev/test seulement)...
```

(Keep the original `**État :**`/`**Travail :**`/`**Priorité :**` body below the new résolu note.)

- [ ] **Step 2: Full verification across touched packages**

Run, and confirm each is green:

```bash
pnpm --filter @czo/kit check-types
pnpm --filter @czo/kit lint
pnpm --filter @czo/kit test src/email/
pnpm --filter @czo/auth check-types
pnpm --filter @czo/auth test src/e2e/
pnpm --filter life check-types
```

Expected: types + lint clean; email unit + Mailpit integration green; auth e2e (incl. the new injection test) green.

- [ ] **Step 3: Stage the backlog + review the full diff**

```bash
git add docs/superpowers/backlog.md
git status
git diff --cached --stat
```

- [ ] **Step 4: Single commit (only after the user has reviewed)**

```bash
git commit -m "feat(kit): SMTP EmailService transport + buildApp services injection (B10)

New @czo/kit/email/smtp (nodemailer): emailServiceFromTransporter (pure
mapping), smtpLayer (Config-driven, pooled, scoped), fromEnv (EMAIL_TRANSPORT
logging|smtp). buildApp gains a generic services? layer, provideMerge'd under
the modules so auth subscriber fibers resolve a host-provided EmailService.
apps/life merges Email.fromEnv. Tests: unit (mapping + selection) + Mailpit
integration (Testcontainers) + auth e2e proving the sign-up→verification-email
chain through the injection. SES deferred (SMTP covers SES-SMTP)."
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/b10-smtp-email
gh pr create --base main --title "feat(kit): SMTP EmailService transport (B10)" --body "<summary per the spec>"
```

---

## Self-Review

**Spec coverage:** architecture (`emailServiceFromTransporter`/`smtpLayer`/`fromEnv`) → Tasks 2–3; Config table → Task 3; `buildApp` `services` injection (`provideMerge` under modules) → Task 5; apps/life wiring → Task 7; unit + Mailpit-in-CI tests → Tasks 2–4; injection proof → Task 6; deps + export → Task 1; error handling (`EmailSendFailed`, existing subscriber log-and-continue) → inherent (no code change needed); out-of-scope (SES/templating/retry) → not built. All covered.

**Placeholder scan:** none — every code/command step is concrete. (Task 1 Step 5 and Task 7 Step 3 are conditional checks with explicit fallbacks, not placeholders.)

**Type consistency:** `emailServiceFromTransporter(transporter, defaultFrom)` returns `{ send: (SendEmailInput) => Effect<void, EmailSendFailed> }`, consumed by `Layer.scoped(EmailService, …)` and `Layer.succeed(EmailService, …)` (capturing test) — same shape as the existing `loggingLayer`. `smtpLayer`/`fromEnv`: `Layer<EmailService, Config.ConfigError>`. `BuildAppOptions.services?: Layer<any, unknown, never>` matches `bootTestApp` `buildOptions` and the harness `opts.services` and `apps/life` `Email.fromEnv` (`Layer<EmailService, ConfigError>` is assignable to `Layer<any, unknown, never>`). Consistent.
