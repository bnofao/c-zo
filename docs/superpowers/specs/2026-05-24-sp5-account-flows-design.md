# SP5 — Account flows (password reset, email verification, change password) — Design Spec

**Status:** Brainstormed, awaiting plan
**Date:** 2026-05-24
**Branch target:** `feat/sp1-auth` (continues SP1 → SP-B → SP-A → SP2 → SP3 → SP4 → SP4b)

## Goal

Porter en natif les trois flows account self-service annoncés en SP1 (password reset, email verification, self-change password), construire l'infrastructure email Effect-native (transport + subscriber + dev stub), et dropper les endpoints better-auth correspondants. Pas d'extension du périmètre annoncé en SP1 (change-email, delete-user, list-accounts, etc. restent hors scope).

## Background

État au début de SP5 (post-SP4b commit `ca1ee8a0`) :

- `PasswordService.hash/verify` (SP1, argon2 / via better-auth crypto).
- `UserService.setPassword(id, password)` — admin-side, hashes via `auth.$context.password.hash`, persist DB.
- Table `verifications` existante (schema SP1) — colonnes `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`. Seul better-auth y écrit aujourd'hui.
- Endpoints better-auth toujours actifs : `/forget-password`, `/reset-password`, `/verify-email`, `/send-verification-email`, `/change-password`. Les emails ne partent pas (`sendResetPassword` + `sendVerificationEmail` sont stubbés `// TODO(events): publish via EmailEvents when the domain bus exists`).
- `/change-password` listé dans `disabledPaths` (post-SP4) mais aucun GraphQL natif ne couvre. Endpoint mort.
- Aucune `EmailService` Tag, aucun bus d'events email, aucune impl de transport.
- `AuthEvent` discriminated union (SP4b) : `SignedUp | ImpersonationStarted | ImpersonationStopped`.
- `SessionService.revokeAllForUser` existe (SP1 + SP4 sweep). Pas de `revokeAllForUserExcept`.

## Architecture & scope

### Modèle global

```
                    ┌──────────────────────────┐
                    │  AccountService          │
GraphQL mutation →  │   - requestPasswordReset │ ──► AuthEvents.publish
                    │   - resetPassword        │     (PasswordResetRequested,
                    │   - requestEmailVerifi.. │      EmailVerificationRequested,
                    │   - verifyEmail          │      PasswordChanged, EmailVerified)
                    │   - changePassword       │              │
                    └──────────────────────────┘              ▼
                       │     │      │                   ┌─────────────────────────┐
                       │     │      │                   │ accountSubscribersLayer │
                       │     │      ▼                   │  (Stream.runForEach)    │
                       │     │   verifications          │   - PasswordReset → mail│
                       │     │   table (R/W)            │   - EmailVerify  → mail │
                       │     ▼                          │   - SignedUp      → re- │
                       │  UserService.setPassword       │     quest verification  │
                       │  (already exists)              └──────┬──────────────────┘
                       ▼                                       │
                    SessionService.revokeAllForUser           │
                    SessionService.revokeAllForUserExcept     ▼
                    (new)                                   EmailService.send
                                                            (LoggingEmailLive
                                                             dev stub by default)
```

### Periphery (5 chantiers)

1. **`EmailService` Tag + `loggingLayer`** — transport pur, `send({to, subject, html, text?, from?})` ; impl stub via `Effect.logInfo('email.send', ...)`.
2. **`AccountService`** (`services/account.ts`, new) — 5 méthodes contract + 4 tagged errors + token CRUD (write avec cooldown 60s, consume atomique via DELETE RETURNING) + `AccountConfig` Tag (TTLs + flags) + `subscribersLayer` qui consomme les 2 `*Requested` events + `SignedUp` pour auto-verification.
3. **`AuthEvent` extension** — 4 nouveaux variants (discriminated union additive).
4. **`SessionService.revokeAllForUserExcept(userId, exceptToken)`** — extension SP1 service pour le flow change-password (revoke other devices, keep current).
5. **GraphQL mutations + drop better-auth** — 5 mutations Relay, drop endpoints `/change-password` `/forget-password` `/reset-password` `/verify-email` `/send-verification-email` + strip `emailVerificationConfig` + `sendResetPassword` stub.

### Hors scope SP5 (per SP1 design)

- **change-email** : symétrique avec verify mais flow distinct (current pwd + new email + re-verify). Sprint dédié.
- **delete-user** (self) : admin path existe déjà ; self-delete future.
- **list-accounts / unlink-account / account-info** : OAuth-side, hors thématique credentials.
- **2FA** : sprint dédié (mentionné en spec SP1 mais bien plus loin).
- **Restauration `@czo/kit/effect`** : dette tech transversale.
- **Real email backends** (SMTP, SES) : SP5 livre l'abstraction et le stub ; real impl quand un client en a besoin.

### Anti-objectifs

- Pas de migration DB (réutilise `verifications` table existante).
- Pas d'endpoint REST natif — tout en GraphQL Relay mutations.
- Pas de templating engine (subscribers composent le HTML inline ; YAGNI pour 2 templates).
- Pas de change-email même si "verify" partage l'infra (scope discipline).

## Decisions log (brainstorm summary)

| # | Question | Choix |
|---|---|---|
| 1 | Scope | **A** — 3 flows + EmailService + drop better-auth (per SP1 design) |
| 2 | Token storage | **A** — réutiliser `verifications` table, identifier préfixé (`password-reset:<userId>` / `email-verification:<userId>`), `value` = sha256(token) |
| 3 | EmailService surface | **A** — transport pur (`send({to, subject, html, text?})`), pas de templating dans le Tag |
| 4 | EmailService impl | **A** — stub-only (`LoggingEmailLive` via `Effect.logInfo`) |
| 5 | Change-password : autres sessions | **A** — revoke all except current. **Reset-password** : revoke all (no exception) |
| 6 | Anti-enumeration | **A** — `requestPasswordReset` always success même si email inconnu. Idem `requestEmailVerification` |
| 7 | Signup verification gate | **C** — config-driven `requireEmailVerification?: boolean` (default false) + `sendVerificationOnSignUp?: boolean` (default true) |
| 8 | Architecture | **A** — `AccountService` unique (1 fichier `services/account.ts`) |
| 9 | Rate-limit | **B** — per-identifier cooldown 60s observed silently (check row récent avant insert) |

## Token model

### Table & convention

Réutilise `verifications` table existante. Pas de migration.

```sql
-- existing (SP1)
verifications {
  id, identifier text NOT NULL, value text NOT NULL,
  expires_at timestamp, created_at timestamp, updated_at timestamp
}
```

**Convention `identifier`** :
- `password-reset:<userId>` (e.g., `password-reset:42`)
- `email-verification:<userId>` (e.g., `email-verification:42`)

Le `<userId>` permet de parser le user concerné au consume (split sur `:`). Multiplex propre.

**Convention `value`** :
- `sha256(rawToken)` en hex.
- Le token brut est généré par `crypto.randomBytes(32).toString('base64url')` (~43 chars).
- Fuite DB ≠ tokens utilisables.

### Token write (avec cooldown)

```ts
const writeToken = Effect.fn('account.tokens.write')(function* (
  kind: IdentifierKind,
  userId: number,
  ttl: Duration.Duration,
) {
  const identifier = `${kind}:${userId}`
  const cooldownCutoff = new Date(Date.now() - 60_000)

  const recent = yield* Effect.tryPromise({
    try: () => db.query.verifications.findFirst({
      where: { identifier, createdAt: { gt: cooldownCutoff } },
    }),
    catch: cause => new AccountDbFailed({ cause }),
  })
  if (recent) return null   // caller treats as success no-op (anti-enum + anti-spam)

  const raw = randomBytes(32).toString('base64url')
  const hashed = createHash('sha256').update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + Duration.toMillis(ttl))

  yield* Effect.tryPromise({
    try: () => db.insert(verifications).values({
      identifier, value: hashed, expiresAt,
      createdAt: new Date(), updatedAt: new Date(),
    }),
    catch: cause => new AccountDbFailed({ cause }),
  })
  return raw
})
```

Multiple valid tokens for the same identifier can coexist (token rotation pre-expiry not implemented — YAGNI). Consume picks the matching hash; non-matching tokens stay until `expiresAt`. `purgeExpired` cleanup (extension to SP1's session purge).

### Token consume (atomic)

```ts
import { and, eq, gt, like } from 'drizzle-orm'

const consumeToken = Effect.fn('account.tokens.consume')(function* (
  kind: IdentifierKind,
  rawToken: string,
) {
  const hashed = createHash('sha256').update(rawToken).digest('hex')
  const now = new Date()

  // DELETE RETURNING for atomic one-shot consume — Drizzle core builder
  // (matches the project pattern at session.ts:218 / api-key.ts:437).
  const [row] = yield* Effect.tryPromise({
    try: () => db.delete(verifications)
      .where(and(
        eq(verifications.value, hashed),
        like(verifications.identifier, `${kind}:%`),
        gt(verifications.expiresAt, now),
      ))
      .returning({ identifier: verifications.identifier }),
    catch: cause => new AccountDbFailed({ cause }),
  })

  if (!row) return null
  const userId = Number(row.identifier.split(':')[1])
  if (!Number.isFinite(userId)) return null
  return userId
})
```

`like(identifier, '<kind>:%')` belt-and-suspenders : un token password-reset ne peut être consommé que via le path password-reset (même si l'attaquant l'utilise sur la mutation verify-email, le `LIKE` filtre). Drizzle builder = auto-typé sur `returning(...)`, pas de cast.

## `EmailService`

`packages/modules/auth/src/services/email.ts` (new) :

```ts
export interface SendEmailInput {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
}

export class EmailSendFailed extends Data.TaggedError('EmailSendFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'EMAIL_SEND_FAILED'
  get message() { return 'Email send operation failed' }
}

export class EmailService extends Context.Service<
  EmailService,
  { readonly send: (input: SendEmailInput) => Effect.Effect<void, EmailSendFailed> }
>()('@czo/auth/EmailService') {}

export const loggingLayer: Layer.Layer<EmailService> = Layer.succeed(EmailService, {
  send: input => Effect.logInfo('email.send', {
    to: input.to,
    from: input.from,
    subject: input.subject,
    bodyPreview: input.text ?? input.html.slice(0, 200),
  }),
})
```

`Effect.logInfo` → structured logs (OTel-compatible). Real impl (SMTP/SES) plug-and-play : new `Layer.Layer<EmailService>` exporté, passé via `AuthModuleConfig.email.layer`.

## `AccountService`

### Tagged errors

```ts
export class AccountDbFailed extends Data.TaggedError('AccountDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ACCOUNT_DB_FAILED'
  get message() { return 'Account store operation failed' }
}

export class InvalidPasswordResetToken extends Data.TaggedError('InvalidPasswordResetToken')<{}>() {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN'
  get message() { return 'Password reset token is invalid or expired' }
}

export class InvalidEmailVerificationToken extends Data.TaggedError('InvalidEmailVerificationToken')<{}>() {
  readonly code = 'INVALID_EMAIL_VERIFICATION_TOKEN'
  get message() { return 'Email verification token is invalid or expired' }
}

export class IncorrectCurrentPassword extends Data.TaggedError('IncorrectCurrentPassword')<{
  readonly userId: number
}> {
  readonly code = 'INCORRECT_CURRENT_PASSWORD'
  get message() { return 'Current password is incorrect' }
}
```

### `AccountConfig` Tag

```ts
export class AccountConfig extends Context.Service<
  AccountConfig,
  {
    readonly passwordResetTtl: Duration.Duration
    readonly emailVerificationTtl: Duration.Duration
    readonly requireEmailVerification: boolean
    readonly sendVerificationOnSignUp: boolean
    readonly baseUrl: string
  }
>()('@czo/auth/AccountConfig') {}

export const makeAccountConfigLayer = (input: {
  passwordResetTtl?: Duration.Duration
  emailVerificationTtl?: Duration.Duration
  requireEmailVerification?: boolean
  sendVerificationOnSignUp?: boolean
  baseUrl: string
}): Layer.Layer<AccountConfig> =>
  Layer.succeed(AccountConfig, {
    passwordResetTtl: input.passwordResetTtl ?? PASSWORD_RESET_TTL,
    emailVerificationTtl: input.emailVerificationTtl ?? EMAIL_VERIFICATION_TTL,
    requireEmailVerification: input.requireEmailVerification ?? false,
    sendVerificationOnSignUp: input.sendVerificationOnSignUp ?? true,
    baseUrl: input.baseUrl,
  })
```

Constants (`constants.ts`) :

```ts
export const PASSWORD_RESET_TTL = Duration.hours(1)
export const EMAIL_VERIFICATION_TTL = Duration.hours(24)
```

### Contract

```ts
export class AccountService extends Context.Service<
  AccountService,
  {
    readonly requestPasswordReset: (email: string) => Effect.Effect<void, AccountDbFailed>
    readonly resetPassword: (input: { token: string, newPassword: string }) =>
      Effect.Effect<void, InvalidPasswordResetToken | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>
    readonly requestEmailVerification: (userId: number) => Effect.Effect<void, AccountDbFailed>
    readonly verifyEmail: (token: string) => Effect.Effect<void, InvalidEmailVerificationToken | AccountDbFailed>
    readonly changePassword: (input: {
      userId: number
      currentSessionToken: string
      currentPassword: string
      newPassword: string
    }) => Effect.Effect<void, UserNotFound | IncorrectCurrentPassword | PasswordHashFailed | AccountDbFailed | SessionStoreFailed>
  }
>()('@czo/auth/AccountService') {}
```

### Per-flow impl summary

**`requestPasswordReset(email)`** :
1. `users.findFirst({ where: { email } })` — wrap `catchAll(null)` (anti-enum).
2. If no user → silent return.
3. `writeToken('password-reset', user.id, config.passwordResetTtl)` → if cooldown returns null → silent.
4. `forkDetach(events.publish PasswordResetRequested({ userId, email, token, expiresAt }))`.

**`resetPassword({ token, newPassword })`** :
1. `consumeToken('password-reset', token)` → null = `InvalidPasswordResetToken`.
2. `users.setPassword(userId, newPassword)` — catch `UserNotFound` → `InvalidPasswordResetToken` (consistent error surface).
3. `sessions.revokeAllForUser(userId)` — revoke ALL sessions.
4. Publish `PasswordChanged({ userId, reason: 'reset' })`.

**`requestEmailVerification(userId)`** :
1. `users.findFirst({ where: { id: userId } })` — `catchAll(null)`.
2. If no user OR user already verified → silent.
3. `writeToken('email-verification', user.id, config.emailVerificationTtl)` → if cooldown → silent.
4. Publish `EmailVerificationRequested({ userId, email, token, expiresAt })`.

**`verifyEmail(token)`** :
1. `consumeToken('email-verification', token)` → null = `InvalidEmailVerificationToken`.
2. `db.update(users).set({ emailVerified: true, updatedAt }).where(eq(users.id, userId))`.
3. Publish `EmailVerified({ userId })`.

**`changePassword({ userId, currentSessionToken, currentPassword, newPassword })`** :
1. Lookup `accounts` row : `where: { userId, providerId: 'credential' }`.
2. If no account or no `password` field → `UserNotFound` (OAuth-only users have no password to change).
3. `passwords.verify(account.password, currentPassword)` → false = `IncorrectCurrentPassword`.
4. `users.setPassword(userId, newPassword)`.
5. `sessions.revokeAllForUserExcept(userId, currentSessionToken)` — revoke OTHER sessions only.
6. Publish `PasswordChanged({ userId, reason: 'self-change' })`.

### `accountSubscribersLayer`

Pattern SP4b `sessionSubscribersLayer` :

```ts
const onPasswordResetRequested = Effect.fn('account.subscribers.password-reset')(
  function* (e: Extract<AuthEvent, { _tag: 'PasswordResetRequested' }>) {
    const config = yield* AccountConfig
    const email = yield* EmailService
    const resetUrl = `${config.baseUrl}/reset-password?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Reset your password',
      html: `<p>Click to reset: <a href="${resetUrl}">${resetUrl}</a></p>
             <p>Expires ${e.expiresAt.toISOString()}</p>`,
      text: `Reset: ${resetUrl}\nExpires ${e.expiresAt.toISOString()}`,
    })
  },
)

const onEmailVerificationRequested = Effect.fn('account.subscribers.email-verification')(
  function* (e: Extract<AuthEvent, { _tag: 'EmailVerificationRequested' }>) {
    const config = yield* AccountConfig
    const email = yield* EmailService
    const verifyUrl = `${config.baseUrl}/verify-email?token=${e.token}`
    yield* email.send({
      to: e.email,
      subject: 'Verify your email',
      html: `<p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Verify: ${verifyUrl}`,
    })
  },
)

const onSignedUp = Effect.fn('account.subscribers.signed-up')(
  function* (e: Extract<AuthEvent, { _tag: 'SignedUp' }>) {
    const config = yield* AccountConfig
    if (!config.sendVerificationOnSignUp) return
    const account = yield* AccountService
    yield* account.requestEmailVerification(e.userId)
  },
)

export const subscribersLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* AuthEvents
    yield* Effect.forkScoped(
      Stream.runForEach(events.subscribe, (e) => {
        const handle
          = e._tag === 'PasswordResetRequested'     ? onPasswordResetRequested(e)
          : e._tag === 'EmailVerificationRequested' ? onEmailVerificationRequested(e)
          : e._tag === 'SignedUp'                   ? onSignedUp(e)
          :                                           Effect.void
        return handle.pipe(
          Effect.catchCause(cause =>
            Effect.logError(`account subscriber failed for ${e._tag}`, cause)),
        )
      }),
    )
  }),
)
```

## `AuthEvent` extension

`services/events/auth.ts` — 4 nouveaux variants ajoutés à l'union :

```ts
| {
    readonly _tag: 'PasswordResetRequested'
    readonly userId: number
    readonly email: string
    readonly token: string                    // raw, for the email body
    readonly expiresAt: Date
  }
| {
    readonly _tag: 'EmailVerificationRequested'
    readonly userId: number
    readonly email: string
    readonly token: string
    readonly expiresAt: Date
  }
| {
    readonly _tag: 'PasswordChanged'
    readonly userId: number
    readonly reason: 'reset' | 'self-change'
  }
| {
    readonly _tag: 'EmailVerified'
    readonly userId: number
  }
```

Non-breaking superset (callers narrowing on `_tag` continuent de fonctionner).

## `SessionService.revokeAllForUserExcept`

`services/session.ts` extension. ~25 lignes prod.

```ts
readonly revokeAllForUserExcept: (userId: number, exceptToken: string) =>
  Effect.Effect<void, SessionStoreFailed>
```

Impl : SELECT tokens du user filtré sur `token != exceptToken`, DELETE batch, invalidate L1/L2 cache pour les tokens supprimés uniquement (pas le kept). Reuse de l'helper `invalidateCacheForToken` (SP4 task 3).

## GraphQL mutations

`graphql/schema/account/{errors,mutations,index}.ts` (new) — pattern SP4b.

| Mutation | Input | Output | AuthScope | Errors |
|---|---|---|---|---|
| `requestPasswordReset` | `{ email: String! }` (zod email validation) | `{ success: Boolean! }` | none (public) | (anti-enum — system errors only) |
| `resetPassword` | `{ token: String!, newPassword: String! }` (passwordSchema) | `{ success: Boolean! }` | none (token-bearing) | `InvalidPasswordResetToken`, `PasswordHashFailed` |
| `requestEmailVerification` | `{}` | `{ success: Boolean! }` | `auth: true` | none |
| `verifyEmail` | `{ token: String! }` | `{ success: Boolean! }` | none (token-bearing) | `InvalidEmailVerificationToken` |
| `changePassword` | `{ currentPassword: String!, newPassword: String! }` | `{ success: Boolean! }` | `auth: true` | `UserNotFound`, `IncorrectCurrentPassword`, `PasswordHashFailed` |

`passwordSchema` extracted from `user/mutations.ts` to `services/utils/password-schema.ts` for DRY (same Zod chain : 8+ chars, upper/lower/digit/special).

`ctx.auth.session!.token` read pattern (SP4b convention) used in `changePassword` for `currentSessionToken`.

## Drop better-auth + strip config

### `disabledPaths` extension

```ts
disabledPaths: [
  // ... existing
  // ─── Account (SP5: covered by native GraphQL mutations) ───────
  '/change-password',
  '/forget-password',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
  // ... rest unchanged
]
```

### Config strip

- **Drop entirely** : `emailVerificationConfig` function in `layers/better-auth/others.ts` + its call in `index.ts:53`. Endpoint disabled, function unreachable.
- **Trim** : `emailAndPasswordConfig` :
  - Drop `sendResetPassword` stub field (no longer reachable since `/forget-password` disabled).
  - Keep `password.hash` / `password.verify` (still used by SP1 sign-up/sign-in path `http/credential.ts` via better-auth — porting that flow native is a separate sprint).
  - Keep `enabled: true`, `minPasswordLength`, `maxPasswordLength`.
- **Wire** `requireEmailVerification` flag from `AuthModuleConfig` through to `emailAndPasswordConfig.requireEmailVerification` so better-auth's sign-in flow honors it (single source of truth via the config field).

## Module wiring

`module.ts` :

```ts
import * as Account from './services/account'
import * as Email from './services/email'

// Inside the factory function:
const AccountConfigLive = Account.makeAccountConfigLayer({
  baseUrl: config.baseUrl ?? throwBaseUrlMissing(),
  requireEmailVerification: config.requireEmailVerification,
  sendVerificationOnSignUp: config.sendVerificationOnSignUp,
  passwordResetTtl: config.account?.passwordResetTtl,
  emailVerificationTtl: config.account?.emailVerificationTtl,
})

const EmailLive = config.email?.layer ?? Email.loggingLayer

const AuthModuleLive = Layer.mergeAll(
  // ... existing
  Account.layer,
  Account.subscribersLayer,
).pipe(
  // ... existing provideMerges
  Layer.provideMerge(AccountConfigLive),
  Layer.provideMerge(EmailLive),
)
```

`AuthModuleConfig` extension :

```ts
interface AuthModuleConfig {
  // ... existing
  baseUrl?: string                                // now read by AccountConfig too
  requireEmailVerification?: boolean              // default false
  sendVerificationOnSignUp?: boolean              // default true
  account?: {
    passwordResetTtl?: Duration.Duration          // default 1h
    emailVerificationTtl?: Duration.Duration      // default 24h
  }
  email?: {
    layer?: Layer.Layer<EmailService>             // default loggingLayer
    from?: string                                 // future hook (SES, etc.)
  }
}
```

`baseUrl` becomes required (or throws at boot) since `AccountConfig.baseUrl` is non-optional. Was already used by OAuth callbacks in `BetterAuthLive`.

## Tests

### `services/account.test.ts` (TDD, integration via `AuthPostgresLayer`)

Test layer composes : `AccountService` + `SessionService` + `UserService` + `PasswordService` + `AuthEvents` + `AccountConfig` + Testcontainers Postgres + mock `EmailService` (`Layer.succeed(EmailService, { send: () => Effect.void })`).

| # | Cas | Method |
|---|---|---|
| 1 | `requestPasswordReset` happy → publishes `PasswordResetRequested` with token | event subscribe + assert |
| 2 | unknown email → always success, no event | assert empty |
| 3 | cooldown : 2 calls <60s → single event | assert single |
| 4 | `resetPassword` valid → password updated, all sessions revoked, `PasswordChanged({reason:'reset'})` | 2 sessions → 0 + verify pwd |
| 5 | invalid token → `InvalidPasswordResetToken` | flip |
| 6 | expired token (manual `expiresAt` past) → `InvalidPasswordResetToken` | direct insert |
| 7 | already-consumed → `InvalidPasswordResetToken` (one-shot) | run twice |
| 8 | wrong kind cross-consume rejected (password-reset can't be consumed as verify) | insert `password-reset:X`, call `verifyEmail(token)` → fails |
| 9 | `requestEmailVerification` happy → `EmailVerificationRequested` | event assert |
| 10 | already-verified user → no event | seed `emailVerified=true` |
| 11 | cooldown 60s | single event |
| 12 | `verifyEmail` valid → `emailVerified=true`, `EmailVerified` event | DB + event assert |
| 13 | invalid token → `InvalidEmailVerificationToken` | |
| 14 | already-verified + second valid token → consume but no behavior change (idempotent) | |
| 15 | `changePassword` correct → updates, revokes OTHER sessions only | 3 sessions → 1 (current) + 2 revoked |
| 16 | incorrect current → `IncorrectCurrentPassword`, password unchanged | |
| 17 | OAuth-only user → `UserNotFound` (no credential account) | |
| 18 | subscribers × `PasswordResetRequested` → `EmailService.send` invoked with reset URL | mock email, capture args |
| 19 | subscribers × `EmailVerificationRequested` → `EmailService.send` with verify URL | |
| 20 | subscribers × `SignedUp` + `sendVerificationOnSignUp=true` → `requestEmailVerification` triggered | publish + assert follow-up event |
| 21 | subscribers × `SignedUp` + `sendVerificationOnSignUp=false` → no follow-up | |

**`SessionService.revokeAllForUserExcept`** (3 new in `session.test.ts`) :
- Revokes all sessions except specified token (verify via `listForUser`).
- exceptToken doesn't exist (typo / stale) → revokes all (defensive, no error).
- User with single session = exceptToken → no-op, session preserved.

**Total** : ~21 AccountService + 3 SessionService ≈ 24 nouveaux tests, ~400 lignes test prod.

### GraphQL mutation tests

Hors-périmètre (convention SP2/SP3/SP4/SP4b — no GraphQL execution harness in module). Type-check + check-types suffisent comme gate.

## Récap & effort

| # | Chantier | Fichiers principaux | LoC prod | LoC tests |
|---|---|---|---|---|
| 1 | `EmailService` Tag + `loggingLayer` | `services/email.ts` (new) | +40 | +10 |
| 2 | `AccountConfig` + constants + `AuthModuleConfig` extension | `services/account.ts` (config block), `constants.ts`, `module.ts` | +50 | — |
| 3 | `AccountService` (5 methods + token CRUD + 4 errors) + `subscribersLayer` | `services/account.ts` (new, ~280) | +280 | +350 |
| 4 | `SessionService.revokeAllForUserExcept` | `services/session.ts` | +25 | +40 |
| 5 | `AuthEvent` widening (4 new variants) | `services/events/auth.ts` | +30 | — |
| 6 | GraphQL mutations + errors + barrel | `graphql/schema/account/{mutations,errors,index}.ts` (new) | +180 | — |
| 7 | Drop better-auth account endpoints + strip configs | `layers/better-auth/{index,others}.ts` | +5 / −40 | — |
| 8 | Module wiring | `module.ts` | +12 | — |

**Net** : ~620 lignes prod, −40 supprimées, ~400 tests. 0 migration DB. 0 endpoint REST cassé sans replacement.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Token reuse race (deux requests parallèles consument le même token) | `DELETE RETURNING` atomique → seul un wins ; l'autre obtient null → `Invalid*Token` |
| Cooldown 60s trop court / trop long | Configurable plus tard si besoin (extension `AccountConfig`) |
| Anti-enum timing leak (lookup user prend ~10ms vs ~30ms si trouve + insert) | Acceptable SP5. Si pen-test exige : `Effect.sleep(random(50, 100))` côté `requestPasswordReset` |
| `requireEmailVerification` rétroactif locks out users existants non-verified | À documenter dans JSDoc `AuthModuleConfig.requireEmailVerification` ; ops doit pré-verify ou backfill |
| `accountSubscribersLayer` reçoit `SignedUp` (déjà émis par SP1) → trigger verification email | Intentionnel — replace better-auth's `sendOnSignUp: true`. Config-gated |
| `changePassword` sur OAuth-only user → `UserNotFound` (confusant) | Acceptable SP5 ; tagged `NoCredentialAccount` future si UX le justifie |
| Subscriber meurt sur email transport failure → bridge fiber lost | `Effect.catchCause(log)` per-event wrap (pattern SP4b fix) |
| `verifyEmail` consume sur user supprimé entre time → `AccountDbFailed` au UPDATE | Acceptable — DELETE cascade sur `users.id` devrait avoir nettoyé la row verifications ; orphan token → `InvalidEmailVerificationToken` |
| `baseUrl` non configuré → reset/verify URLs cassées | `AccountConfig.baseUrl` non-optional ; boot throws si missing |
| `passwords.verify` slow (argon2) sur path public → DoS vector via `resetPassword` repeated calls | Cooldown 60s + DELETE RETURNING atomique limitent. Real rate-limit GraphQL-wide est un sprint séparé |

## Ordre d'exécution suggéré

1. `EmailService` Tag + `loggingLayer` — foundation, isolated.
2. `AccountConfig` + constants + `AuthModuleConfig` extension — types only, additive.
3. `AuthEvent` widening — additive, non-breaking superset.
4. `SessionService.revokeAllForUserExcept` — SP1 service extension needed by `changePassword`.
5. `AccountService` impl + tests (TDD) — le gros morceau.
6. GraphQL mutations + errors — surface client.
7. Module wiring — branche tout ensemble.
8. Drop better-auth account endpoints + strip configs — final cleanup après que tout le natif soit testé et wired.
