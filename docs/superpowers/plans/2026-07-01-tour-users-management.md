# Tour Users Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `apps/tour` Users page fully operational — create users (invite-only), modify roles, ban/activate, and resend invitations — backed by real `@czo/auth` admin mutations.

**Architecture:** Two layers. **Backend** (`@czo/auth`, Effect-native Pothos code-first): a new invitation flow (a `password-reset` token surfaced as a "set your password" email via a dedicated `InvitationRequested` event), an `invite` flag + optional password on `createUser`, a `resendInvitation` mutation, and a `roleHierarchies` query so the role picker is dynamic. **Frontend** (`apps/tour`, TanStack Start): TanStack `createServerFn` POST wrappers over those mutations, four dialogs (create / roles / ban / activate) built from `@workspace/ui` primitives, wired into the existing `users-list.tsx`, RBAC-gated with `can()`, refreshed with `queryClient.invalidateQueries` + `router.invalidate()`.

**Tech Stack:** Effect 4 (`Effect.gen`/`fn`/`fnUntraced`), Pothos (`builder.relayMutationField`/`queryField`/`objectRef`), Drizzle RQBv2, `@effect/vitest` + Testcontainers, TanStack Start/Router/Query, Tolgee i18n, `@workspace/ui` (Base-UI-style) components.

## Global Constraints

- **No autonomous commits.** Stage with `git add` only. One commit at the very end, after explicit user review. Never `git commit`/`git stash` mid-execution. Commit attribution is disabled (no `Co-Authored-By`). — This overrides the per-task "Commit" steps below: replace each with `git add <paths>` and record the staged files in the ledger; do **not** run `git commit`.
- **Effect-native service code:** no `async`/`await`/`try`/`catch`. Use `Effect.gen`, `Effect.fn(name)`/`Effect.fnUntraced`, `Effect.sync`, `Effect.tryPromise`. Tagged errors via `Data.TaggedError`.
- **Tests:** `@effect/vitest` (`it.effect`, `it.layer`). Integration tests use the shared `AuthPostgresLayer` + `truncateAuth` from `packages/modules/auth/src/testing/postgres.ts`. Never `Effect.runSync`. Never import `@czo/kit/effect` (it does not exist). Assert Effect failures with `Effect.flip` then check `err._tag`.
- **Role model:** platform roles are a **cumulative CSV** across independent hierarchies (`admin:viewer ⊂ admin:manager ⊂ admin`; other hierarchies: `api-key`, `apps`, `price`, `channel`, `inventory`, `stock-location`, `attribute`, `product`, locale/`translation`). The role picker is **multi-select but at most one tier per hierarchy** (e.g. `admin:manager,product:manager` is valid; `admin:viewer,admin:manager` is not). Enforced in the UI; the backend already validates registry-membership via `ensureValidRole`.
- **Create flow is invite-only** to match the design: no password field in the form; `createUser.password` is optional; the invitation email delivers a `/reset-password?token=` link the user uses to set their password.
- **i18n:** all user-facing strings go through Tolgee `t('...')` with **flat dotted keys**, added to **both** `apps/tour/src/i18n/en.json` and `apps/tour/src/i18n/fr-FR.json`.
- **No toast library.** There is no sonner/toast in the repo — do not add one. Signal success by closing the dialog + `queryClient.invalidateQueries({ queryKey: ['users'] })` (and `router.invalidate()` where `me` may change). Signal errors with inline dialog state (mirror `login.tsx`/`nav-user.tsx`).
- **Global IDs are pass-through:** `UserRow.id` from the `users` connection is already the Relay global ID that `banUser`/`updateUser`/etc. (`t.globalID({ for: 'User' })`) expect. Pass `row.id` straight into mutation `id` variables — no encode/decode.
- **GraphQL codegen is two-phase:** the tour codegen reads a **built** SDL file `apps/tour/src/graphql/admin.graphql`. After any backend schema change you must (1) build `@czo/auth` + `@czo/life`, (2) `pnpm --filter @czo/life emit:sdl` (regenerates `admin.graphql` from the built dist), (3) `pnpm --filter tour codegen` (the tour script is named `codegen`, not `generate`).

---

## File Structure

**Backend (`packages/modules/auth`):**
- `src/services/events/auth.ts` — add `InvitationRequested` to the `AuthEvent` union.
- `src/services/account.ts` — add `sendInvitation` to the `AccountService` contract + impl; add `onInvitationRequested` subscriber; branch it in `subscribersLayer`.
- `src/services/account.invitation.integration.test.ts` — **new** integration test for the invitation flow.
- `src/graphql/schema/user/mutations.ts` — make `createUser.password` optional, add `invite`; add `resendInvitation` mutation.
- `src/graphql/schema/user/types.ts` — add `RoleTier` + `RoleHierarchy` object refs.
- `src/graphql/schema/user/queries.ts` — add `roleHierarchies` query.
- `src/graphql/schema/user/*.integration.test.ts` — extend/create coverage for createUser-invite, resendInvitation, roleHierarchies.

**Frontend (`apps/tour`):**
- `src/graphql/admin.graphql`, `src/graphql/gen/**` — regenerated (do not hand-edit `gen/`).
- `src/server/users.server.ts` — add mutation server-fns + `fetchRoleHierarchies`.
- `src/components/users-query.ts` — add `roleHierarchiesQueryOptions` + role helpers.
- `src/components/role-picker.tsx` — **new** shared multi-select (one tier per hierarchy).
- `src/components/user-create-dialog.tsx` — **new**.
- `src/components/user-roles-dialog.tsx` — **new**.
- `src/components/user-ban-dialog.tsx` — **new** (ban + activate).
- `src/components/users-list.tsx` — wire the Create button + `RowMenu`, RBAC gating, dialog state.
- `src/i18n/en.json`, `src/i18n/fr-FR.json` — new keys.
- `src/components/users-query.test.ts` (or extend `src/server/users.server.test.ts`) — pure-helper tests.

---

## Task 1: Invitation backend (`sendInvitation` + event + email)

**Files:**
- Modify: `packages/modules/auth/src/services/events/auth.ts` (add to `AuthEvent` union, after the `PasswordResetRequested` member, ~line 39)
- Modify: `packages/modules/auth/src/services/account.ts` (contract ~line 134; impl closure near `requestPasswordReset` ~line 264; `AccountService.of({...})` ~line 620; subscribers ~line 654; `subscribersLayer` ~line 737)
- Test: `packages/modules/auth/src/services/account.invitation.integration.test.ts` (new)

**Interfaces:**
- Consumes: `writeToken('password-reset', userId, ttl)` (existing private helper), `events.publish`, `config.passwordResetTtl`, `config.baseUrl`, `sendEmail(input)` (existing module-level helper).
- Produces: `AccountService.sendInvitation: (input: { readonly userId: number, readonly email: string }) => Effect.Effect<void, AccountDbFailed>` — writes a `password-reset` token and publishes `InvitationRequested`. No-op if a token was issued within the cooldown window (`writeToken` returns `null`).

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/services/account.invitation.integration.test.ts`. Mirror the EmailService-mock + AuthPostgresLayer pattern used by `soft-delete.integration.test.ts`. Capture sent emails in a mutable array via a mock `EmailService` layer, provide `AccountService.layer` + `subscribersLayer`, seed a user, call `sendInvitation`, and assert an email with a `/reset-password?token=` link was sent to that user.

```ts
import { it } from '@effect/vitest'
import { Effect, Layer, TestClock } from 'effect'
import { EmailService } from '@czo/kit/email'
import { expect } from 'vitest'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import { AccountService, subscribersLayer } from './account'
import { UserService } from './user'

const sent: { to: string, subject: string, html: string }[] = []
const EmailCapture = Layer.succeed(EmailService, {
  send: input => Effect.sync(() => { sent.push({ to: input.to, subject: input.subject, html: input.html }) }),
})

it.layer(Layer.mergeAll(AccountService.Default, subscribersLayer, EmailCapture).pipe(Layer.provideMerge(AuthPostgresLayer)))(
  'invitation',
  (it) => {
    it.effect('sendInvitation emails a set-password link to the user', () =>
      Effect.gen(function* () {
        yield* truncateAuth
        sent.length = 0
        const users = yield* UserService
        const created = yield* users.create({ email: 'invitee@czo.com', name: 'Invitee', password: undefined, role: undefined })
        const account = yield* AccountService
        yield* account.sendInvitation({ userId: created.id, email: created.email })
        // Subscriber runs on the PubSub fiber; yield to let it drain.
        yield* Effect.sleep('50 millis')
        const mail = sent.find(m => m.to === 'invitee@czo.com')
        expect(mail).toBeDefined()
        expect(mail!.html).toContain('/reset-password?token=')
      }))
  },
)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @czo/auth test account.invitation.integration`
Expected: FAIL — `sendInvitation` is not a property of `AccountService` (TS/property error), or no email captured.

- [ ] **Step 3: Add `InvitationRequested` to the `AuthEvent` union**

In `src/services/events/auth.ts`, add this member to the union (immediately after the `PasswordResetRequested` block, ~line 39). It intentionally mirrors `PasswordResetRequested`:

```ts
  | {
    readonly _tag: 'InvitationRequested'
    readonly userId: number
    readonly email: string
    /** Raw set-password token for the invitation email body. Never persisted raw — only sha256(token) is. */
    readonly token: string
    readonly expiresAt: Date
  }
```

- [ ] **Step 4: Add `sendInvitation` to the `AccountService` contract**

In `src/services/account.ts`, add to the `Context.Service` contract (near `requestEmailVerification`, ~line 134):

```ts
    readonly sendInvitation: (input: {
      readonly userId: number
      readonly email: string
    }) => Effect.Effect<void, AccountDbFailed>
```

- [ ] **Step 5: Implement `sendInvitation` in the layer**

In the layer's `Effect.gen`, add the closure next to `requestPasswordReset` (~line 282). It reuses the `password-reset` token kind so the emailed `/reset-password?token=` link sets the user's password:

```ts
    const sendInvitation = Effect.fn('account.sendInvitation')(function* (input: { userId: number, email: string }) {
      const raw = yield* writeToken('password-reset', input.userId, config.passwordResetTtl)
      if (raw === null)
        return
      yield* Effect.forkDetach(events.publish({
        _tag: 'InvitationRequested',
        userId: input.userId,
        email: input.email,
        token: raw,
        expiresAt: new Date(Date.now() + Duration.toMillis(config.passwordResetTtl)),
      }))
    })
```

Then add `sendInvitation` to the returned `AccountService.of({ ... })` object (~line 620), alongside `requestPasswordReset`.

- [ ] **Step 6: Add the `onInvitationRequested` subscriber**

In `src/services/account.ts` subscribers section (after `onPasswordResetRequested`, ~line 666):

```ts
const onInvitationRequested = Effect.fn('account.subscribers.invitation')(
  function* (e: Extract<AuthEvent, { _tag: 'InvitationRequested' }>) {
    const config = yield* AccountConfig
    const url = `${config.baseUrl}/reset-password?token=${e.token}`
    yield* sendEmail({
      to: e.email,
      subject: 'Vous avez été invité — définissez votre mot de passe',
      html: `<p>Vous avez été invité à rejoindre le backoffice. Cliquez pour définir votre mot de passe : <a href="${url}">${url}</a></p><p>Expire le ${e.expiresAt.toISOString()}</p>`,
      text: `Définissez votre mot de passe : ${url}\nExpire le ${e.expiresAt.toISOString()}`,
    })
  },
)
```

- [ ] **Step 7: Wire the subscriber into `subscribersLayer`**

In the `Stream.runForEach` ternary chain (~line 742), add a branch (place it right after the `PasswordResetRequested` branch):

```ts
        e._tag === 'InvitationRequested'
          ? runSubscriber(e._tag, onInvitationRequested(e))
          : e._tag === 'PasswordResetRequested'
```

(i.e. insert `e._tag === 'InvitationRequested' ? runSubscriber('InvitationRequested', onInvitationRequested(e)) :` at the head of the existing chain.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @czo/auth test account.invitation.integration`
Expected: PASS.

- [ ] **Step 9: Lint + typecheck**

Run: `pnpm --filter @czo/auth lint:fix && pnpm --filter @czo/auth check-types`
Expected: clean.

- [ ] **Step 10: Stage (no commit)**

```bash
git add packages/modules/auth/src/services/events/auth.ts packages/modules/auth/src/services/account.ts packages/modules/auth/src/services/account.invitation.integration.test.ts
```

---

## Task 2: `createUser` — optional password + `invite` flag

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/user/mutations.ts:95-137` (the `createUser` field)
- Test: `packages/modules/auth/src/graphql/schema/user/create-user-invite.integration.test.ts` (new) OR extend an existing user-mutations integration test if present.

**Interfaces:**
- Consumes: `User.UserService.create`, `AccountService.sendInvitation` (Task 1). `AccountService` is already provided by the app runtime, so it is reachable from `ctx.runEffect`.
- Produces: `createUser(input: { email!, name!, password?, role?, invite? })` — creates the user and, when `invite` is true, sends an invitation email.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/graphql/schema/user/create-user-invite.integration.test.ts`. Use the same EmailService-capture + AuthPostgresLayer harness as Task 1, but drive `UserService.create` + `AccountService.sendInvitation` directly (the resolver logic), asserting: (a) a user with **no password** is created (no credential row / `emailVerified === false`), and (b) an invitation email is sent.

```ts
import { it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { EmailService } from '@czo/kit/email'
import { expect } from 'vitest'
import { AuthPostgresLayer, truncateAuth } from '../../../testing/postgres'
import { AccountService, subscribersLayer } from '../../../services/account'
import { UserService } from '../../../services/user'

const sent: { to: string }[] = []
const EmailCapture = Layer.succeed(EmailService, {
  send: input => Effect.sync(() => { sent.push({ to: input.to }) }),
})

it.layer(Layer.mergeAll(AccountService.Default, subscribersLayer, EmailCapture).pipe(Layer.provideMerge(AuthPostgresLayer)))(
  'createUser invite',
  (it) => {
    it.effect('creates a password-less user and invites them', () =>
      Effect.gen(function* () {
        yield* truncateAuth
        sent.length = 0
        const users = yield* UserService
        const account = yield* AccountService
        const u = yield* users.create({ email: 'new@czo.com', name: 'New', password: undefined, role: ['admin:viewer'] })
        yield* account.sendInvitation({ userId: u.id, email: u.email })
        yield* Effect.sleep('50 millis')
        expect(u.emailVerified).toBe(false)
        expect(u.role).toBe('admin:viewer')
        expect(sent.some(m => m.to === 'new@czo.com')).toBe(true)
      }))
  },
)
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @czo/auth test create-user-invite.integration`
Expected: FAIL only if Task 1 is incomplete; if Task 1 is done this asserts the composed behavior — if it already passes, proceed (this test guards the create+invite contract the resolver will use). Then continue to make the **GraphQL** change below.

- [ ] **Step 3: Make `password` optional and add `invite` on the `createUser` field**

In `src/graphql/schema/user/mutations.ts`, change the `createUser` `inputFields` (lines ~100-105) to:

```ts
      inputFields: t => ({
        email: t.string({ description: 'Email address for the new user; normalized to lowercase.', required: true, validate: z.email().transform(email => email.toLowerCase()) }),
        name: t.string({ description: 'Display name for the new user.', required: true, validate: z.string().max(225).min(1).transform(name => name.trim()) }),
        password: t.string({ description: 'Optional initial password. Omit to create an invite-only account whose password is set via the invitation email.', required: false, validate: z.string().min(8).max(128).nullable().optional() }),
        role: t.stringList({ description: 'Global platform roles to assign to the new user.' }),
        invite: t.boolean({ description: 'When true, send an invitation email with a set-password link after creation.', required: false }),
      }),
```

- [ ] **Step 4: Trigger the invitation in the resolver**

Import `AccountService` at the top of `mutations.ts`:

```ts
import { Account, Session, User } from '../../../services'
```

(If `Account` is not re-exported from `../../../services`, import directly: `import { AccountService } from '../../../services/account'` and use `AccountService` below.)

Replace the `createUser` `resolve` body (lines ~121-129) with:

```ts
      resolve: async (_root, { input }, ctx) => {
        const user = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* User.UserService
            const created = yield* svc.create(input)
            if (input.invite) {
              const account = yield* Account.AccountService
              yield* account.sendInvitation({ userId: created.id, email: created.email })
            }
            return created
          }),
        )
        return user
      },
```

(Use whichever import form Step 4's first line resolved to. `User.UserService.create` already ignores an absent `password`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @czo/auth test create-user-invite.integration && pnpm --filter @czo/auth check-types`
Expected: PASS + clean.

- [ ] **Step 6: Lint + stage**

```bash
pnpm --filter @czo/auth lint:fix
git add packages/modules/auth/src/graphql/schema/user/mutations.ts packages/modules/auth/src/graphql/schema/user/create-user-invite.integration.test.ts
```

---

## Task 3: `resendInvitation` mutation

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/user/mutations.ts` (add a new `relayMutationField` after `unbanUser`, ~line 211)
- Test: `packages/modules/auth/src/graphql/schema/user/resend-invitation.integration.test.ts` (new)

**Interfaces:**
- Consumes: `User.UserService.findFirst`, `Account.AccountService.sendInvitation`, `UserNotFound` (already imported in `mutations.ts`).
- Produces: `resendInvitation(input: { id: ID! }) -> { success: Boolean! }`, authScope `{ permission: { resource: 'user', actions: ['create'] } }`.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/graphql/schema/user/resend-invitation.integration.test.ts`, same harness as Task 2. Assert: resend for an existing user sends an email; resend for a missing id fails (the resolver throws `UserNotFound` — at the service level, model it as `UserService.findFirst` returning null → the mutation would throw; here test the service composition):

```ts
// ...same EmailCapture + layer setup as Task 2...
it.effect('resend sends an invitation to an existing user', () =>
  Effect.gen(function* () {
    yield* truncateAuth; sent.length = 0
    const users = yield* UserService
    const account = yield* AccountService
    const u = yield* users.create({ email: 'r@czo.com', name: 'R', password: undefined, role: undefined })
    const found = yield* users.findFirst({ where: { id: u.id } })
    expect(found).not.toBeNull()
    yield* account.sendInvitation({ userId: u.id, email: u.email })
    yield* Effect.sleep('50 millis')
    expect(sent.some(m => m.to === 'r@czo.com')).toBe(true)
  }))
```

- [ ] **Step 2: Run to verify it passes on the service composition**

Run: `pnpm --filter @czo/auth test resend-invitation.integration`
Expected: PASS (validates the building blocks). Now add the GraphQL mutation.

- [ ] **Step 3: Add the `resendInvitation` mutation**

In `src/graphql/schema/user/mutations.ts`, after the `unbanUser` block (~line 211), add:

```ts
  // ── resendInvitation ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'resendInvitation',
    {
      ...A.input,
      inputFields: t => ({
        id: t.globalID({ description: 'Global ID of the user to (re)invite.', for: 'User', required: true }),
      }),
    },
    {
      ...A.field,
      description: 'Re-sends the invitation email (a set-password link) to a user. Admin-only.',
      errors: { types: [UserNotFound], ...A.errorOpts },
      authScopes: { permission: { resource: 'user', actions: ['create'] } },
      resolve: async (_root, { input }, ctx) => {
        const userId = Number(input.id.id)
        await ctx.runEffect(
          Effect.gen(function* () {
            const users = yield* User.UserService
            const user = yield* users.findFirst({ where: { id: userId } })
            if (!user)
              return yield* Effect.fail(new UserNotFound({ id: userId }))
            const account = yield* Account.AccountService
            yield* account.sendInvitation({ userId: user.id, email: user.email })
          }),
        )
        return { success: true }
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        success: t.boolean({ description: 'Whether the invitation was dispatched.', resolve: payload => payload.success }),
      }),
    },
  )
```

**Note:** confirm the `UserNotFound` constructor shape by reading `./errors.ts` — match its exact field(s) (it is thrown elsewhere as `new UserNotFound({ id })` or similar; use the constructor the file defines). If `UserService.findFirst` already fails with `UserNotFound` for a missing id rather than returning null, drop the null-check and let it propagate (read `user.ts` `findFirst` to confirm which).

- [ ] **Step 4: Typecheck + lint + test**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint:fix && pnpm --filter @czo/auth test resend-invitation.integration`
Expected: clean + PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/modules/auth/src/graphql/schema/user/mutations.ts packages/modules/auth/src/graphql/schema/user/resend-invitation.integration.test.ts
```

---

## Task 4: `roleHierarchies` query + `RoleHierarchy`/`RoleTier` types

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/user/types.ts` (add object refs after `UserCounts`, ~line 59)
- Modify: `packages/modules/auth/src/graphql/schema/user/queries.ts` (add query after `userCounts`, ~line 63)
- Test: `packages/modules/auth/src/graphql/schema/user/role-hierarchies.integration.test.ts` (new) — asserts the registered `admin` hierarchy is returned with its ordered tiers.

**Interfaces:**
- Consumes: `AccessService.hierarchies: Effect<readonly AccessHierarchyProvider[]>` where `AccessHierarchyProvider = { name: string, hierarchy: { name: string, permissions }[] }`.
- Produces: `roleHierarchies: [RoleHierarchy!]!` where `type RoleHierarchy { name: String!, tiers: [RoleTier!]! }` and `type RoleTier { name: String! }`. `RoleTier.name` is the full CSV token (e.g. `"admin:manager"`); `RoleHierarchy.name` is the domain (e.g. `"admin"`). Tiers are in cumulative order (lowest → highest), matching `hierarchy[]` order.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/graphql/schema/user/role-hierarchies.integration.test.ts`. Resolve `AccessService.hierarchies` through the app's access layer and assert the `admin` hierarchy exists with tiers `['admin:viewer','admin:manager','admin']`. Use the module's access-registry test harness (grep `AccessService` usages in existing tests, e.g. `services/access.test.ts`, for the exact layer to provide). Skeleton:

```ts
import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
// import the layer that registers ADMIN/API_KEY/APPS hierarchies (see index.ts buildAccessLayer / services/access.test.ts)
import { AccessService } from '../../../services/access'

it.effect('exposes the admin hierarchy tiers in order', () =>
  Effect.gen(function* () {
    const access = yield* AccessService
    const hs = yield* access.hierarchies
    const admin = hs.find(h => h.name === 'admin')
    expect(admin).toBeDefined()
    expect(admin!.hierarchy.map(l => l.name)).toEqual(['admin:viewer', 'admin:manager', 'admin'])
  }).pipe(Effect.provide(/* the access layer used by services/access.test.ts */)))
```

Read `packages/modules/auth/src/services/access.test.ts` to copy its exact `Effect.provide(...)` layer for a registry preloaded with `ADMIN_HIERARCHY`.

- [ ] **Step 2: Run to verify it fails/passes at the service level**

Run: `pnpm --filter @czo/auth test role-hierarchies.integration`
Expected: PASS once the layer is correct (this validates the data source). Now expose it via GraphQL.

- [ ] **Step 3: Add `RoleTier` + `RoleHierarchy` object refs**

In `src/graphql/schema/user/types.ts`, after the `UserCounts` block (~line 59), add (mirroring the `UserCounts`/`Permission` objectRef style; note the resolver shape below defines the backing TS types inline):

```ts
  // ── RoleTier / RoleHierarchy (role-picker registry) ───────────────────────
  const roleTierRef = builder.objectRef<{ name: string }>('RoleTier').implement({
    subGraphs: ['admin'],
    description: 'A single assignable role tier, e.g. "admin:manager". Tiers within a hierarchy are cumulative (higher tiers include lower ones).',
    fields: t => ({
      name: t.exposeString('name', { description: 'Full CSV role token stored on the user (e.g. "admin:manager").' }),
    }),
  })

  builder.objectRef<{ name: string, tiers: { name: string }[] }>('RoleHierarchy').implement({
    subGraphs: ['admin'],
    description: 'A role hierarchy (domain) and its assignable tiers in cumulative order. A user may hold at most one tier per hierarchy.',
    fields: t => ({
      name: t.exposeString('name', { description: 'Hierarchy/domain name (e.g. "admin", "product").' }),
      tiers: t.field({ type: [roleTierRef], description: 'Assignable tiers, lowest → highest.', resolve: h => h.tiers }),
    }),
  })
```

- [ ] **Step 4: Add the `roleHierarchies` query**

Ensure `AccessService` is imported in `queries.ts` (it is imported in `types.ts` — copy the import: `import { AccessService } from '../../../services/access'`). After the `userCounts` query (~line 63) add:

```ts
  // ── roleHierarchies — assignable role registry for the admin role picker ───
  builder.queryField('roleHierarchies', t =>
    t.field({
      type: ['RoleHierarchy'],
      subGraphs: ['admin'],
      description: 'All registered global role hierarchies and their assignable tiers, for the admin role picker.',
      authScopes: { permission: { resource: 'user', actions: ['read'] } },
      resolve: (_root, _args, ctx) => ctx.runEffect(Effect.gen(function* () {
        const access = yield* AccessService
        const hs = yield* access.hierarchies
        return hs.map(h => ({ name: h.name, tiers: h.hierarchy.map(l => ({ name: l.name })) }))
      })) as never,
    }))
```

- [ ] **Step 5: Typecheck + lint + test**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter @czo/auth lint:fix && pnpm --filter @czo/auth test role-hierarchies.integration`
Expected: clean + PASS. (The `'RoleHierarchy'` string type reference resolves because the objectRef in Step 3 registers that name.)

- [ ] **Step 6: Stage**

```bash
git add packages/modules/auth/src/graphql/schema/user/types.ts packages/modules/auth/src/graphql/schema/user/queries.ts packages/modules/auth/src/graphql/schema/user/role-hierarchies.integration.test.ts
```

---

## Task 5: Regenerate admin SDL + tour server-fns + role helpers

**Files:**
- Regenerate: `apps/tour/src/graphql/admin.graphql`, `apps/tour/src/graphql/gen/**`
- Modify: `apps/tour/src/server/users.server.ts` (add mutation server-fns + `fetchRoleHierarchies`)
- Modify: `apps/tour/src/components/users-query.ts` (add `roleHierarchiesQueryOptions` + pure role helpers)
- Test: `apps/tour/src/components/users-query.test.ts` (new) — pure helper tests.

**Interfaces:**
- Produces (server-fns, all `createServerFn`):
  - `createUser({ email, name, roles, invite })` → `{ id }`
  - `updateUserRoles({ id, roles })` → `{ id }`
  - `banUser({ id, reason })` → `{ id }`
  - `unbanUser({ id })` → `{ id }`
  - `resendInvitation({ id })` → `{ success }`
  - `fetchRoleHierarchies()` → `RoleHierarchy[]` where `RoleHierarchy = { name: string, tiers: { name: string }[] }`
- Produces (helpers in `users-query.ts`): `roleHierarchiesQueryOptions()`, `hierarchyOf(role: string): string` (domain before first `:`), `dedupeOneTierPerHierarchy(roles: string[], hierarchies: RoleHierarchy[]): string[]`.

- [ ] **Step 1: Build backend + emit SDL**

Run (from repo root):
```bash
pnpm --filter @czo/auth build && pnpm --filter @czo/life build && pnpm --filter @czo/life emit:sdl
```
Expected: `apps/tour/src/graphql/admin.graphql` now contains `createUser(... invite: Boolean ...)`, `resendInvitation`, `type RoleHierarchy`, `type RoleTier`, and `roleHierarchies`. Verify: `grep -n "roleHierarchies\|resendInvitation\|RoleHierarchy\|invite" apps/tour/src/graphql/admin.graphql`.

- [ ] **Step 2: Write the failing helper test**

Create `apps/tour/src/components/users-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dedupeOneTierPerHierarchy, hierarchyOf } from './users-query'

const HIER = [
  { name: 'admin', tiers: [{ name: 'admin:viewer' }, { name: 'admin:manager' }, { name: 'admin' }] },
  { name: 'product', tiers: [{ name: 'product:viewer' }, { name: 'product:manager' }] },
]

describe('role helpers', () => {
  it('hierarchyOf splits on the first colon; bare role → itself', () => {
    expect(hierarchyOf('admin:manager')).toBe('admin')
    expect(hierarchyOf('admin')).toBe('admin')
    expect(hierarchyOf('product:viewer')).toBe('product')
  })
  it('keeps at most one tier per hierarchy (last selection wins)', () => {
    expect(dedupeOneTierPerHierarchy(['admin:viewer', 'admin:manager', 'product:viewer'], HIER))
      .toEqual(['admin:manager', 'product:viewer'])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter tour test users-query`
Expected: FAIL — helpers not exported.

- [ ] **Step 4: Implement the helpers**

Append to `apps/tour/src/components/users-query.ts`:

```ts
import { queryOptions } from '@tanstack/react-query'
import { fetchRoleHierarchies } from '../server/users.server'

export interface RoleHierarchy { name: string, tiers: { name: string }[] }

/** Domain of a role token — the segment before the first ':' (a bare role is its own domain). */
export function hierarchyOf(role: string): string {
  const i = role.indexOf(':')
  return i === -1 ? role : role.slice(0, i)
}

/** Collapse a role list to at most one tier per hierarchy, preserving the last-selected tier per domain. */
export function dedupeOneTierPerHierarchy(roles: string[], hierarchies: RoleHierarchy[]): string[] {
  const domainOf = (r: string) => hierarchies.find(h => h.tiers.some(t => t.name === r))?.name ?? hierarchyOf(r)
  const byDomain = new Map<string, string>()
  for (const r of roles) byDomain.set(domainOf(r), r)
  return [...byDomain.values()]
}

export function roleHierarchiesQueryOptions() {
  return queryOptions({
    queryKey: ['roleHierarchies'],
    queryFn: () => fetchRoleHierarchies(),
    staleTime: Infinity, // registry is static at runtime
  })
}
```

(If `queryOptions` is already imported at the top of the file, do not duplicate the import — merge it.)

- [ ] **Step 5: Add the server-fns**

Append to `apps/tour/src/server/users.server.ts` (module-scope `graphql()` docs + `createServerFn` handlers). Field selections must match the emitted SDL — the relay mutations return a payload; select the minimal `user { id }` / `success`:

```ts
const CreateUserDoc = graphql(`
  mutation AdminCreateUser($input: CreateUserInput!) {
    createUser(input: $input) { user { id } }
  }
`)
export const createUser = createServerFn({ method: 'POST' })
  .validator((data: { email: string, name: string, roles: string[], invite: boolean }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ createUser: { user: { id: string } } }>(CreateUserDoc, {
      input: { email: data.email, name: data.name, role: data.roles, invite: data.invite },
    })
    return { id: res.createUser.user.id }
  })

const UpdateUserRolesDoc = graphql(`
  mutation AdminUpdateUserRoles($input: UpdateUserInput!) {
    updateUser(input: $input) { user { id } }
  }
`)
export const updateUserRoles = createServerFn({ method: 'POST' })
  .validator((data: { id: string, roles: string[] }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ updateUser: { user: { id: string } } }>(UpdateUserRolesDoc, {
      input: { id: data.id, role: data.roles },
    })
    return { id: res.updateUser.user.id }
  })

const BanUserDoc = graphql(`
  mutation AdminBanUser($input: BanUserInput!) {
    banUser(input: $input) { user { id } }
  }
`)
export const banUser = createServerFn({ method: 'POST' })
  .validator((data: { id: string, reason?: string | null }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ banUser: { user: { id: string } } }>(BanUserDoc, {
      input: { id: data.id, reason: data.reason ?? null },
    })
    return { id: res.banUser.user.id }
  })

const UnbanUserDoc = graphql(`
  mutation AdminUnbanUser($input: UnbanUserInput!) {
    unbanUser(input: $input) { user { id } }
  }
`)
export const unbanUser = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ unbanUser: { user: { id: string } } }>(UnbanUserDoc, { input: { id: data.id } })
    return { id: res.unbanUser.user.id }
  })

const ResendInvitationDoc = graphql(`
  mutation AdminResendInvitation($input: ResendInvitationInput!) {
    resendInvitation(input: $input) { success }
  }
`)
export const resendInvitation = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await gqlAdmin<{ resendInvitation: { success: boolean } }>(ResendInvitationDoc, { input: { id: data.id } })
    return { success: res.resendInvitation.success }
  })

const RoleHierarchiesDoc = graphql(`
  query AdminRoleHierarchies {
    roleHierarchies { name tiers { name } }
  }
`)
export const fetchRoleHierarchies = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ name: string, tiers: { name: string }[] }[]> => {
    const res = await gqlAdmin<{ roleHierarchies: { name: string, tiers: { name: string }[] }[] }>(RoleHierarchiesDoc, {})
    return res.roleHierarchies
  })
```

**Note:** the exact GraphQL input type names (`CreateUserInput`, `UpdateUserInput`, `BanUserInput`, `UnbanUserInput`, `ResendInvitationInput`) come from the relay plugin's `<MutationName>Input` convention — confirm each against `apps/tour/src/graphql/admin.graphql` after Step 1 and adjust the doc strings to the emitted names.

- [ ] **Step 6: Regenerate tour types**

Run: `pnpm --filter tour codegen`
Expected: `apps/tour/src/graphql/gen/**` updates with no error; the new `graphql()` docs typecheck.

- [ ] **Step 7: Typecheck + helper test**

Run: `pnpm --filter tour check-types && pnpm --filter tour test users-query`
Expected: clean + PASS.

- [ ] **Step 8: Lint + stage**

```bash
pnpm --filter tour lint:fix
git add apps/tour/src/graphql/admin.graphql apps/tour/src/graphql/gen apps/tour/src/server/users.server.ts apps/tour/src/components/users-query.ts apps/tour/src/components/users-query.test.ts
```

---

## Task 6: `RolePicker` + Create-user dialog

**Files:**
- Create: `apps/tour/src/components/role-picker.tsx`
- Create: `apps/tour/src/components/user-create-dialog.tsx`

**Interfaces:**
- Consumes: `roleHierarchiesQueryOptions`, `dedupeOneTierPerHierarchy`, `RoleHierarchy` (Task 5); `createUser` server-fn; `@workspace/ui/components/{dialog,input,label,checkbox,button,select}`; `useTranslate`.
- Produces:
  - `RolePicker({ value, onChange }: { value: string[], onChange: (roles: string[]) => void })` — renders one `Select` per hierarchy (a "— none —" option + its tiers); merges selections into a deduped `string[]` (one tier per hierarchy).
  - `UserCreateDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void })`.

- [ ] **Step 1: Implement `RolePicker`**

`apps/tour/src/components/role-picker.tsx` — one `Select` per hierarchy, at most one tier each (this structurally guarantees the "one tier per hierarchy" rule):

```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import { Label } from '@workspace/ui/components/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@workspace/ui/components/select'
import { hierarchyOf, roleHierarchiesQueryOptions } from './users-query'

const NONE = '__none__'

/** Human label for a role tier; falls back to the raw token. */
export function useRoleLabel() {
  const { t } = useTranslate()
  return (token: string) => {
    const key = `users.roleTier.${token}`
    const label = t(key)
    return label === key ? token : label
  }
}

export function RolePicker({ value, onChange }: { value: string[], onChange: (roles: string[]) => void }) {
  const { data: hierarchies = [] } = useQuery(roleHierarchiesQueryOptions())
  const roleLabel = useRoleLabel()
  const selectedFor = (domain: string) => value.find(r => hierarchyOf(r) === domain) ?? NONE

  const setForDomain = (domain: string, tier: string) => {
    const rest = value.filter(r => hierarchyOf(r) !== domain)
    onChange(tier === NONE ? rest : [...rest, tier])
  }

  return (
    <div className="flex flex-col gap-3">
      {hierarchies.map(h => (
        <div key={h.name} className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{h.name}</Label>
          <Select value={selectedFor(h.name)} onValueChange={v => setForDomain(h.name, v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {h.tiers.map(tier => (
                <SelectItem key={tier.name} value={tier.name}>{roleLabel(tier.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
```

**Note:** confirm `Select`'s controlled API (`value` + `onValueChange`) against `packages/ui/src/components/select.tsx`. If it is a Base-UI select using `value`/`onValueChange` this is correct; if the prop is `onChange`, adjust.

- [ ] **Step 2: Implement `UserCreateDialog`**

`apps/tour/src/components/user-create-dialog.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import * as React from 'react'
import { createUser } from '../server/users.server'
import { errorCode } from '../graphql/admin-error'
import { RolePicker } from './role-picker'

export function UserCreateDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const { t } = useTranslate()
  const qc = useQueryClient()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [roles, setRoles] = React.useState<string[]>([])
  const [invite, setInvite] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => { setName(''); setEmail(''); setRoles([]); setInvite(true); setError(null) }

  const submit = async () => {
    setPending(true); setError(null)
    try {
      await createUser({ data: { email: email.trim(), name: name.trim(), roles, invite } })
      await qc.invalidateQueries({ queryKey: ['users'] })
      reset(); onOpenChange(false); onCreated()
    }
    catch (e) {
      setError(errorCode(e) ? t(`users.error.${errorCode(e)}`, t('users.error.generic')) : t('users.error.generic'))
    }
    finally { setPending(false) }
  }

  const valid = name.trim() && /.+@.+\..+/.test(email)

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(o) : (reset(), onOpenChange(o)))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.create.title')}</DialogTitle>
          <DialogDescription>{t('users.create.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cu-name">{t('users.create.name')}</Label>
            <Input id="cu-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cu-email">{t('users.create.email')}</Label>
            <Input id="cu-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('users.create.roles')}</Label>
            <RolePicker value={roles} onChange={setRoles} />
          </div>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={invite} onCheckedChange={v => setInvite(v === true)} />
            <span className="text-sm leading-tight">
              {t('users.create.invite')}
              <span className="block text-xs text-muted-foreground">{t('users.create.inviteHint')}</span>
            </span>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!valid || pending}>{t('users.create.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Note:** confirm `Checkbox`'s API (`checked` + `onCheckedChange`) and `errorCode`'s import path (`../graphql/admin-error`) and `t(key, fallback)` signature against the codebase; adjust to the actual signatures. If `t` doesn't take a positional fallback, use `t(key)` guarded by the `key`-echo check as in `useRoleLabel`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter tour check-types && pnpm --filter tour lint:fix`
Expected: clean (i18n keys are added in Task 11; missing keys don't break the build — Tolgee returns the key at runtime).

- [ ] **Step 4: Stage**

```bash
git add apps/tour/src/components/role-picker.tsx apps/tour/src/components/user-create-dialog.tsx
```

---

## Task 7: Change-roles dialog

**Files:**
- Create: `apps/tour/src/components/user-roles-dialog.tsx`

**Interfaces:**
- Consumes: `RolePicker` (Task 6), `updateUserRoles` server-fn, `UserRow` type, `@workspace/ui` dialog primitives.
- Produces: `UserRolesDialog({ user, onOpenChange }: { user: UserRow | null, onOpenChange: (o: boolean) => void })` — open when `user` is non-null. Pre-fills from `user.role` (CSV → `string[]`), saves via `updateUserRoles`.

- [ ] **Step 1: Implement**

`apps/tour/src/components/user-roles-dialog.tsx`:

```tsx
import type { UserRow } from '../server/users.server'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@workspace/ui/components/dialog'
import * as React from 'react'
import { updateUserRoles } from '../server/users.server'
import { errorCode } from '../graphql/admin-error'
import { RolePicker } from './role-picker'

const csvToRoles = (role: string) => role.split(',').map(s => s.trim()).filter(Boolean)

export function UserRolesDialog({ user, onOpenChange }: { user: UserRow | null, onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslate()
  const qc = useQueryClient()
  const [roles, setRoles] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => { if (user) { setRoles(csvToRoles(user.role)); setError(null) } }, [user])

  const submit = async () => {
    if (!user) return
    setPending(true); setError(null)
    try {
      await updateUserRoles({ data: { id: user.id, roles } })
      await qc.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
    }
    catch (e) {
      setError(errorCode(e) ? t(`users.error.${errorCode(e)}`) : t('users.error.generic'))
    }
    finally { setPending(false) }
  }

  return (
    <Dialog open={user != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.roles.title')}</DialogTitle>
          <DialogDescription>{t('users.roles.subtitle')}</DialogDescription>
        </DialogHeader>
        <RolePicker value={roles} onChange={setRoles} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={pending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck + lint + stage**

Run: `pnpm --filter tour check-types && pnpm --filter tour lint:fix`
```bash
git add apps/tour/src/components/user-roles-dialog.tsx
```

---

## Task 8: Ban + Activate dialog

**Files:**
- Create: `apps/tour/src/components/user-ban-dialog.tsx`

**Interfaces:**
- Consumes: `banUser`/`unbanUser` server-fns, `@workspace/ui/components/{alert-dialog,select,textarea,label}`.
- Produces: `UserBanDialog({ action, onOpenChange }: { action: { type: 'ban' | 'activate', user: UserRow } | null, onOpenChange: (o: boolean) => void })`.

- [ ] **Step 1: Implement**

`apps/tour/src/components/user-ban-dialog.tsx`. Ban path collects a reason (`Select`, options are i18n'd) + optional details (`Textarea`); Activate path is a plain confirm:

```tsx
import type { UserRow } from '../server/users.server'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslate } from '@tolgee/react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { Label } from '@workspace/ui/components/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@workspace/ui/components/select'
import { Textarea } from '@workspace/ui/components/textarea'
import * as React from 'react'
import { banUser, unbanUser } from '../server/users.server'
import { errorCode } from '../graphql/admin-error'

const BAN_REASONS = ['rules', 'suspicious', 'spam', 'requested', 'other'] as const

export function UserBanDialog({ action, onOpenChange }: {
  action: { type: 'ban' | 'activate', user: UserRow } | null
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useTranslate()
  const qc = useQueryClient()
  const [reason, setReason] = React.useState<string>('')
  const [details, setDetails] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => { setReason(''); setDetails(''); setError(null) }, [action])

  const isBan = action?.type === 'ban'
  const valid = !isBan || (reason && (reason !== 'other' || details.trim()))

  const submit = async () => {
    if (!action) return
    setPending(true); setError(null)
    try {
      if (action.type === 'ban') {
        const label = t(`users.ban.reason.${reason}`)
        const composed = details.trim() ? `${label} — ${details.trim()}` : label
        await banUser({ data: { id: action.user.id, reason: composed } })
      }
      else {
        await unbanUser({ data: { id: action.user.id } })
      }
      await qc.invalidateQueries({ queryKey: ['users'] })
      onOpenChange(false)
    }
    catch (e) {
      setError(errorCode(e) ? t(`users.error.${errorCode(e)}`) : t('users.error.generic'))
    }
    finally { setPending(false) }
  }

  return (
    <AlertDialog open={action != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isBan ? t('users.ban.title') : t('users.activate.title')}</AlertDialogTitle>
          <AlertDialogDescription>{isBan ? t('users.ban.subtitle') : t('users.activate.subtitle')}</AlertDialogDescription>
        </AlertDialogHeader>
        {isBan
          ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('users.ban.reasonLabel')}</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger><SelectValue placeholder={t('users.ban.reasonPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {BAN_REASONS.map(r => <SelectItem key={r} value={r}>{t(`users.ban.reason.${r}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('users.ban.detailsLabel')}</Label>
                  <Textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>
            )
          : (error ? <p className="text-sm text-destructive">{error}</p> : null)}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); submit() }}
            disabled={!valid || pending}
            className={isBan ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {isBan ? t('users.ban.confirm') : t('users.activate.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

**Note:** `AlertDialogAction` typically auto-closes on click; `e.preventDefault()` keeps it open while the async mutation runs. Verify this against `packages/ui/src/components/alert-dialog.tsx` and adjust if the component already supports a pending/async pattern.

- [ ] **Step 2: Typecheck + lint + stage**

Run: `pnpm --filter tour check-types && pnpm --filter tour lint:fix`
```bash
git add apps/tour/src/components/user-ban-dialog.tsx
```

---

## Task 9: Wire actions into `users-list.tsx` (RowMenu, Create button, resend, RBAC, role badges)

**Files:**
- Modify: `apps/tour/src/components/users-list.tsx`

**Interfaces:**
- Consumes: all four dialogs, `resendInvitation` server-fn, `can` from `../lib/rbac`, the route's `me` via `getRouteApi('/_authed/users').useRouteContext()`, `useRoleLabel` from `role-picker`.
- Produces: a fully interactive users table.

- [ ] **Step 1: Add dialog state, `me`, and capability flags**

At the top of `UsersList()` add:

```tsx
import { getRouteApi } from '@tanstack/react-router'
// ...
const { me } = getRouteApi('/_authed/users').useRouteContext()
const qc = useQueryClient()
const [creating, setCreating] = React.useState(false)
const [rolesUser, setRolesUser] = React.useState<UserRow | null>(null)
const [banAction, setBanAction] = React.useState<{ type: 'ban' | 'activate', user: UserRow } | null>(null)

const caps = {
  create: can(me, 'user', 'create'),
  setRole: can(me, 'user', 'set-role'),
  ban: can(me, 'user', 'ban'),
}
```

(Import `useQueryClient` from `@tanstack/react-query`, `can` from `../lib/rbac`, `UserRow` type, and the four dialog components + `resendInvitation`.)

- [ ] **Step 2: Replace the placeholder `RowMenu`**

Replace the current `RowMenu` (lines ~73-88) with one that receives the row + capability flags + handlers, mirroring the design's action set (Modifier les rôles / Renvoyer l'invitation / Bannir|Activer):

```tsx
function RowMenu({ user, caps, t, onRoles, onBan, onActivate, onResend }: {
  user: UserRow
  caps: { setRole: boolean, ban: boolean, create: boolean }
  t: TFn
  onRoles: () => void
  onBan: () => void
  onActivate: () => void
  onResend: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('users.actions.label')} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {caps.setRole ? <DropdownMenuItem onClick={onRoles}>{t('users.actions.changeRole')}</DropdownMenuItem> : null}
        {caps.create && !user.emailVerified ? <DropdownMenuItem onClick={onResend}>{t('users.actions.resendInvite')}</DropdownMenuItem> : null}
        {caps.ban
          ? (
              <>
                <DropdownMenuSeparator />
                {user.banned
                  ? <DropdownMenuItem onClick={onActivate}>{t('users.actions.activate')}</DropdownMenuItem>
                  : <DropdownMenuItem variant="destructive" onClick={onBan}>{t('users.actions.deactivate')}</DropdownMenuItem>}
              </>
            )
          : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Add the resend handler + inline notice**

Resend has no dialog, but its result must be visible — surface it via a transient inline notice (a small text line above the table), **not** a swallowed `catch` and **not** a toast library. Add notice state to `UsersList()`:

```tsx
const [notice, setNotice] = React.useState<{ kind: 'ok' | 'err', text: string } | null>(null)

const onResend = async (user: UserRow) => {
  setNotice(null)
  try {
    await resendInvitation({ data: { id: user.id } })
    setNotice({ kind: 'ok', text: t('users.resend.sent') })
  }
  catch (e) {
    setNotice({ kind: 'err', text: errorCode(e) ? t(`users.error.${errorCode(e)}`) : t('users.error.generic') })
  }
}
```

Render the notice just above the `<DataTable ... />` (line ~268), and clear it on tab/search changes (call `setNotice(null)` inside `onTab`/`onSearchChange`):

```tsx
{notice
  ? <p className={notice.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{notice.text}</p>
  : null}
```

(Import `errorCode` from `../graphql/admin-error`.)

- [ ] **Step 4: Pass row + handlers into the `actions` column and role labels into the `role` column**

In `useUserColumns`, update the `role` cell to render each CSV tier as a `Badge` via `useRoleLabel`, and the `actions` cell to render the new `RowMenu`. Because `useRoleLabel`/handlers need hook context, thread them through `useUserColumns(t, dateFmt, roleLabel, handlers)` or inline the columns in the component. Minimal change — update the two cells:

```tsx
// role cell:
cell: ({ row }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {(row.original.role ? row.original.role.split(',').map(s => s.trim()).filter(Boolean) : []).map(r => (
      <Badge key={r} variant="outline">{roleLabel(r)}</Badge>
    ))}
  </div>
),
// actions cell:
cell: ({ row }) => (
  <RowMenu
    user={row.original}
    caps={caps}
    t={t}
    onRoles={() => setRolesUser(row.original)}
    onBan={() => setBanAction({ type: 'ban', user: row.original })}
    onActivate={() => setBanAction({ type: 'activate', user: row.original })}
    onResend={() => onResend(row.original)}
  />
),
```

(Pass `roleLabel` (from `useRoleLabel()`), `caps`, and the setters into `useUserColumns` via its dependency array, or move `useUserColumns` inline. Keep the memo deps correct: `[t, dateFmt, roleLabel, caps]`.)

- [ ] **Step 5: Gate the Create button + mount the dialogs**

Change the header Create button (line ~233) to gate on `caps.create` and open the dialog:

```tsx
{caps.create
  ? (
      <Button onClick={() => setCreating(true)}>
        <Plus />
        {t('users.create')}
      </Button>
    )
  : null}
```

Before the closing `</div>` of the component, mount the dialogs:

```tsx
<UserCreateDialog open={creating} onOpenChange={setCreating} onCreated={() => qc.invalidateQueries({ queryKey: ['users', 'counts'] })} />
<UserRolesDialog user={rolesUser} onOpenChange={o => !o && setRolesUser(null)} />
<UserBanDialog action={banAction} onOpenChange={o => !o && setBanAction(null)} />
```

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter tour check-types && pnpm --filter tour lint:fix`
Expected: clean.

- [ ] **Step 7: Stage**

```bash
git add apps/tour/src/components/users-list.tsx
```

---

## Task 10: i18n keys (EN + FR)

**Files:**
- Modify: `apps/tour/src/i18n/en.json`
- Modify: `apps/tour/src/i18n/fr-FR.json`

**Interfaces:** flat dotted keys referenced by Tasks 6–9.

- [ ] **Step 1: Add keys to `en.json`**

Add (merge with existing `users.*` block; keep valid JSON):

```json
"common.cancel": "Cancel",
"common.save": "Save",
"users.actions.activate": "Activate",
"users.resend.sent": "Invitation sent.",
"users.create.title": "Create user",
"users.create.subtitle": "Add a member and assign them a role.",
"users.create.name": "Full name",
"users.create.email": "Email address",
"users.create.roles": "Roles",
"users.create.invite": "Send an invitation email",
"users.create.inviteHint": "The user will receive a link to set their password.",
"users.create.submit": "Create user",
"users.roles.title": "Edit roles",
"users.roles.subtitle": "Adjust this user's permissions.",
"users.ban.title": "Ban this user?",
"users.ban.subtitle": "Backoffice access is revoked immediately. You can reactivate them at any time.",
"users.ban.reasonLabel": "Ban reason",
"users.ban.reasonPlaceholder": "Select a reason…",
"users.ban.detailsLabel": "Details (optional)",
"users.ban.confirm": "Ban user",
"users.ban.reason.rules": "Rules violation",
"users.ban.reason.suspicious": "Suspicious activity",
"users.ban.reason.spam": "Spam / abuse",
"users.ban.reason.requested": "User request",
"users.ban.reason.other": "Other",
"users.activate.title": "Reactivate this user?",
"users.activate.subtitle": "The user will regain backoffice access with their previous roles.",
"users.activate.confirm": "Reactivate",
"users.error.generic": "Something went wrong. Please try again.",
"users.error.FORBIDDEN": "You don't have permission to do that.",
"users.roleTier.admin:viewer": "Read-only",
"users.roleTier.admin:manager": "Manager",
"users.roleTier.admin": "Administrator"
```

- [ ] **Step 2: Add the same keys to `fr-FR.json`**

```json
"common.cancel": "Annuler",
"common.save": "Enregistrer",
"users.actions.activate": "Activer",
"users.resend.sent": "Invitation envoyée.",
"users.create.title": "Créer un utilisateur",
"users.create.subtitle": "Ajoutez un membre et attribuez-lui un rôle.",
"users.create.name": "Nom complet",
"users.create.email": "Adresse email",
"users.create.roles": "Rôles",
"users.create.invite": "Envoyer une invitation par email",
"users.create.inviteHint": "L'utilisateur recevra un lien pour définir son mot de passe.",
"users.create.submit": "Créer l'utilisateur",
"users.roles.title": "Modifier les rôles",
"users.roles.subtitle": "Ajustez les permissions de cet utilisateur.",
"users.ban.title": "Bannir cet utilisateur ?",
"users.ban.subtitle": "L'accès au backoffice sera révoqué immédiatement. Vous pourrez le réactiver à tout moment.",
"users.ban.reasonLabel": "Motif du bannissement",
"users.ban.reasonPlaceholder": "Sélectionner un motif…",
"users.ban.detailsLabel": "Détails (facultatif)",
"users.ban.confirm": "Bannir l'utilisateur",
"users.ban.reason.rules": "Violation des règles",
"users.ban.reason.suspicious": "Activité suspecte",
"users.ban.reason.spam": "Spam / abus",
"users.ban.reason.requested": "Demande de l'utilisateur",
"users.ban.reason.other": "Autre",
"users.activate.title": "Réactiver cet utilisateur ?",
"users.activate.subtitle": "L'utilisateur retrouvera l'accès au backoffice avec ses rôles précédents.",
"users.activate.confirm": "Réactiver",
"users.error.generic": "Une erreur est survenue. Veuillez réessayer.",
"users.error.FORBIDDEN": "Vous n'avez pas la permission d'effectuer cette action.",
"users.roleTier.admin:viewer": "Lecture seule",
"users.roleTier.admin:manager": "Gestionnaire",
"users.roleTier.admin": "Administrateur"
```

- [ ] **Step 3: Validate JSON + typecheck**

Run: `pnpm --filter tour lint:fix && node -e "JSON.parse(require('fs').readFileSync('apps/tour/src/i18n/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/tour/src/i18n/fr-FR.json','utf8')); console.log('ok')"`
Expected: `ok`, lint clean.

- [ ] **Step 4: Stage**

```bash
git add apps/tour/src/i18n/en.json apps/tour/src/i18n/fr-FR.json
```

---

## Task 11: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check both packages**

Run: `pnpm --filter @czo/auth check-types && pnpm --filter tour check-types`
Expected: clean.

- [ ] **Step 2: Backend tests**

Run: `pnpm --filter @czo/auth test account.invitation.integration create-user-invite.integration resend-invitation.integration role-hierarchies.integration`
Expected: all PASS.

- [ ] **Step 3: Frontend helper tests**

Run: `pnpm --filter tour test users-query`
Expected: PASS.

- [ ] **Step 4: Runtime verification (use the `verify` skill)**

Bring up the stack (`life` + `tour` + Postgres + an `EmailService`/mailhog if configured), sign in as an `admin`, and exercise each flow at the real surface:
- Create user (invite) → user appears in the list as unverified; an invitation email with `/reset-password?token=` is dispatched (check the mail sink / `email.skipped` log if no EmailService).
- Modifier les rôles → change tiers; the row's role badges update after refetch.
- Bannir → row shows "Banni"; Activer → back to normal.
- Renvoyer l'invitation → visible only for unverified users; triggers a fresh email.
- Confirm the RBAC gating: as a non-admin (`admin:viewer`), the action items / Create button are hidden.

Capture evidence per the `verify` skill. If no full runtime is available, state that explicitly and rely on Steps 1–3 plus the design match.

- [ ] **Step 5: Report staged changeset for review (NO commit)**

Run: `git status && git diff --cached --stat`
Present the staged changeset to the user for review. Do **not** commit — await explicit approval.

---

## Notes for the executor

- **Confirm-before-transcribe:** several steps end with a "Note" asking you to confirm an exact API against the real file (`Select`/`Checkbox`/`AlertDialogAction` props, `UserNotFound` constructor, relay `*Input` type names, `t(key, fallback)` signature). Do that check as part of the step — do not assume.
- **`emit:sdl` reads built dist:** if `admin.graphql` doesn't show the new fields after Task 5 Step 1, rebuild `@czo/auth` and `@czo/life` first (`pnpm --filter @czo/auth build && pnpm --filter @czo/life build`) — the SDL emitter reads compiled output, not source.
- **Do not commit `apps/tour/.output/`** or any build artifacts. Stage only source + generated `src/graphql/gen` + `admin.graphql`.
- **`pnpm-workspace.yaml` `^0.0.0` corruption:** if a tool zeroes catalog versions, `git restore pnpm-workspace.yaml` before proceeding — it is unrelated to this work.
