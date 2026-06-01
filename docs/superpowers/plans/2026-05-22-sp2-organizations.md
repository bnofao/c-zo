# SP2 — Organizations: Invitation Workflows & Active-Org — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the five deferred organization mutations — `inviteMember`, `acceptInvitation`, `rejectInvitation`, `setActiveOrganization`, `leaveOrganization` — as Effect-native, better-auth-free GraphQL.

**Architecture:** Add three invitation methods to the existing `OrganizationService` and one mutating method (`update`) to `SessionService`; fold three invitation event variants into the existing `OrganizationEvent` union; wire five thin `relayMutationField` resolvers. No DB schema change, no better-auth.

**Tech Stack:** `effect@4.0.0-beta.70`, `drizzle-orm@1.0.0-rc.3` (`effect-postgres`), Pothos GraphQL, `@effect/vitest` + Testcontainers.

**Source spec:** `docs/superpowers/specs/2026-05-22-sp2-organizations-design.md`

---

## Conventions for every task

- **TDD.** Each service/session method: write the failing test (RED), run it to confirm it fails, implement, run it green (GREEN). Tests are written first.
- **Test style — SP1's runnable pattern.** New service tests use `@effect/vitest` (`describe`/`it`/`layer`/`expect`) + the Testcontainers helpers `AuthPostgresLayer` / `truncateAuth` from `src/testing/postgres.ts`. They do **not** import `@czo/kit/effect` (that module was removed; `expectSuccess`/`expectFailure` no longer exist). Assert failures with `Effect.flip` (failure → success channel) and check `err._tag`. The pre-existing broken `services/organization.test.ts` (old `vi.fn()` + `@czo/kit/effect` style) is **left untouched** — out of scope.
- **Real names (verified against current code — use these exactly):**
  - Existing errors reused: `OrganizationNotFound`, `NotAMember`, `OrgUserNotFound`, `OrgInvalidRole`, `MemberAlreadyExists`, `MemberNotFound`, `MemberLimitReached`, `CannotRemoveLastOwner`, `InvitationNotFound`, `InvitationExpired`, `InvitationAlreadyExists`, `OrgDbFailed`.
  - **New errors (this plan adds exactly two):** `InvitationNotPending`, `InvitationEmailMismatch`.
  - Invitation domain type is the hand-written interface `OrganizationInvitation` (NOT an `InferSelectModel` `Invitation`).
  - GraphQL: mutations use `builder.relayMutationField` (4-arg form); effects run via `ctx.runEffect(Effect.gen(function* () { … }))`; auth user is `ctx.auth?.user`; Relay IDs via `decodeGlobalID(input.x)` → `{ id }`; `UnauthenticatedError` from `@czo/kit/graphql`.
  - Events publish via `yield* Effect.forkDetach(events.publish({ _tag: '…', … }))`.
- **`sessions.activeOrganizationId` is a `text` column** while `organizations.id` is `integer` — convert with `String(orgId)` on write.
- **Type-check:** `pnpm check-types` in `@czo/auth` after each task; target is the Task 1 baseline — no NEW errors.
- **Commits:** do NOT commit during execution. `git add` (stage) only — one review + commit after Task 10 (the repo's no-commit-until-review preference). Never `git stash`.

---

## File Structure

**Modified:**
- `packages/modules/auth/src/constants.ts` — add `INVITATION_DURATION`.
- `packages/modules/auth/src/services/organization.ts` — 2 new errors (+ union), 3 invitation methods + `findFirstMember` (Tag + impl); `removeMember` input changed to `memberId` (drop the ambiguous `OR`/email match).
- `packages/modules/auth/src/services/events/organization.ts` — 3 new `OrganizationEvent` variants; fix the stale "separate InvitationEvents bus" doc comment.
- `packages/modules/auth/src/services/session.ts` — `update` method (Tag + impl).
- `packages/modules/auth/src/graphql/schema/organization/errors.ts` — register + re-export the 2 new errors.
- `packages/modules/auth/src/graphql/schema/organization/mutations.ts` — 5 new mutations (replace the phase-2 comment); function-form `authScopes` on the existing org mutations; `removeMember` input → `memberId`.
- `packages/modules/auth/src/graphql/scopes.ts` — new boolean `auth` authScope; `permission` authScope reworked to org-scoped (Task 6).
- `packages/modules/auth/src/graphql/index.ts` — `auth: boolean` + `permission.organization` added to the `BuilderAuthScopes` augmentation.
- `packages/modules/auth/src/services/session.test.ts` — `update` test cases.
- `packages/modules/auth/src/database/schema.ts` — partial unique index on `invitations` (the only schema change).

**New:**
- `packages/modules/auth/src/services/organization-invitations.test.ts` — tests for the 3 new service methods.
- `packages/modules/auth/src/graphql/schema/organization/mutations.test.ts` — mutation tests (if no org mutation test file exists; otherwise extend it).
- `packages/modules/auth/migrations/<timestamp>_invitation_pending_unique/` — generated migration for the partial unique index.

**Unchanged:** all DB tables/columns (the only schema delta is the `invitations` partial unique index), `better-auth` config, `graphql/schema/organization/inputs.ts` (stays dead — `inviteMember` inlines its `inputFields` like every other org mutation; resurrecting the dead `registerOrganizationInputs` would be inconsistent with the codebase — this is a deliberate deviation from spec §3 item 7, which assumed registration; flagged for plan review).

---

## Task 1: Foundation — constants, errors, events, invitation-uniqueness migration

**Files:**
- Modify: `packages/modules/auth/src/constants.ts`
- Modify: `packages/modules/auth/src/services/organization.ts`
- Modify: `packages/modules/auth/src/services/events/organization.ts`
- Modify: `packages/modules/auth/src/graphql/schema/organization/errors.ts`
- Modify: `packages/modules/auth/src/database/schema.ts`
- Create: `packages/modules/auth/migrations/<timestamp>_<name>/` (generated)

Scaffolding — no TDD (no behavior yet).

- [ ] **Step 1: Capture the check-types baseline**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types 2>&1 | grep -cE "error TS"
```
Record it here — every later task's sweep returns to it.

**Task 1 baseline:** `@czo/auth: ___`

- [ ] **Step 2: Add `INVITATION_DURATION`**

In `constants.ts`, below `SESSION_DURATION`:

```ts
/**
 * Lifetime of a pending organization invitation. Drives the `invitations`
 * row `expiresAt` (`now + INVITATION_DURATION`). Convert at the boundary
 * with `Duration.toMillis`.
 */
export const INVITATION_DURATION: Duration.Duration = Duration.days(7)
```

- [ ] **Step 3: Add the two new tagged errors**

In `services/organization.ts`, with the other `Data.TaggedError` classes (after `InvitationLimitReached`):

```ts
export class InvitationNotPending extends Data.TaggedError('InvitationNotPending') {
  readonly code = 'INVITATION_NOT_PENDING'
  get message() { return 'This invitation is no longer pending' }
}

export class InvitationEmailMismatch extends Data.TaggedError('InvitationEmailMismatch') {
  readonly code = 'INVITATION_EMAIL_MISMATCH'
  get message() { return 'Invitation email does not match the authenticated user' }
}
```

(Match the file's zero-payload-error convention exactly — no `<{}>` generic, and a `get message()` accessor like every other error in the file.)

Add both to the `OrganizationError` union.

- [ ] **Step 4: Add the 3 invitation event variants**

In `services/events/organization.ts`, add to the `OrganizationEvent` union:

```ts
  | {
    readonly _tag: 'InvitationCreated'
    readonly invitationId: number
    readonly orgId: number
    readonly email: string
    readonly role: string
    readonly inviterId: number
  }
  | {
    readonly _tag: 'InvitationAccepted'
    readonly invitationId: number
    readonly orgId: number
    readonly userId: number
  }
  | {
    readonly _tag: 'InvitationRejected'
    readonly invitationId: number
    readonly orgId: number
  }
```

(Multi-line, one field per line, and the org-id field is named `orgId` — matching every existing `OrganizationEvent` variant. Tasks 2–4 publish these with `orgId`.)

Update the file's header doc comment: it currently says invitation events "will land in a separate `InvitationEvents` bus" — change it to state that invitation lifecycle events are part of `OrganizationEvent` (decided: no separate bus).

- [ ] **Step 5: Register the 2 new errors as Pothos errors**

In `graphql/schema/organization/errors.ts`: add `InvitationNotPending` and `InvitationEmailMismatch` to the destructure off `Organization`, add them to the re-export block, and add `registerError` calls (no payload fields — neither error carries data):

```ts
registerError(builder, InvitationNotPending, { name: 'InvitationNotPendingError' })
registerError(builder, InvitationEmailMismatch, { name: 'InvitationEmailMismatchError' })
```

- [ ] **Step 6: Add the partial unique index to the `invitations` schema**

In `database/schema.ts`, add a partial unique index to the `invitations`
`pgTable` via its table-extras callback (the third `pgTable` argument). This is
the race-proof backstop: it guarantees at most one **pending** invitation per
`(organization_id, email)` while leaving historical `accepted`/`rejected`/
`cancelled` rows unconstrained.

```ts
import { sql } from 'drizzle-orm'
import { uniqueIndex } from 'drizzle-orm/pg-core'   // add if not already imported

export const invitations = pgTable('invitations', {
  // …existing columns, unchanged…
}, table => [
  uniqueIndex('invitations_org_email_pending_uniq')
    .on(table.organizationId, table.email)
    .where(sql`${table.status} = 'pending'`),
])
```

If `invitations` is currently `pgTable('invitations', { … })` with no third
argument, add the callback; if it already has one, append the index to its
returned array. Do not change any column.

- [ ] **Step 7: Generate the migration**

Generate a migration from the schema change (run from `packages/modules/auth`):

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm migrate:create invitation_pending_unique
```

Verify `package.json`'s `migrate:create` script: it should be a `drizzle-kit`
generate that **diffs `schema.ts`** and emits SQL. Confirm the new
`migrations/<timestamp>_invitation_pending_unique/` folder's `.sql` contains
exactly a partial unique index — equivalent to:

```sql
CREATE UNIQUE INDEX "invitations_org_email_pending_uniq"
  ON "invitations" ("organization_id","email")
  WHERE "status" = 'pending';
```

If `migrate:create` produces an **empty** migration (does not diff), hand-write
that `CREATE UNIQUE INDEX … WHERE "status" = 'pending';` statement into the
generated `.sql` file. The Testcontainers `AuthPostgresLayer` applies the
`migrations/` folder on boot, so SP2's integration tests pick the index up
automatically — no test wiring needed.

- [ ] **Step 8: Type-check + stage**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
git add packages/modules/auth/src packages/modules/auth/migrations
```
Expected: error count == Task 1 baseline (the new symbols are unused so far — that is fine; they are consumed in Tasks 2–9).

---

## Task 2: `OrganizationService.createInvitation`

**Files:**
- Create: `packages/modules/auth/src/services/organization-invitations.test.ts`
- Modify: `packages/modules/auth/src/services/organization.ts`

- [ ] **Step 1: Write the test file scaffold + failing `createInvitation` tests**

Create `services/organization-invitations.test.ts`:

```ts
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { ORGANIZATION_HIERARCHY, ORGANIZATION_STATEMENTS } from '../plugins/access'
import { invitations, members, organizations, users } from '../database/schema'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as OrganizationEvents from './events/organization'
import * as Organization from './organization'

const { OrganizationService } = Organization

// OrganizationService over Testcontainers Postgres, with AccessService seeded
// with the organization domain so role validation (`org:*` roles) passes.
const TestLayer = Organization.layer.pipe(
  Layer.provide(Layer.mergeAll(
    Access.makeLayer(
      [{ name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY }] as never,
      true,
    ),
    OrganizationEvents.layer,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

// ─── Seed helper ─────────────────────────────────────────────────────────
// Inserts a user, an organization, and that user as an `org:owner` member.
// Returns their ids. Run inside an Effect that has DrizzleDb.
function seedOrgWithOwner(email: string, slug: string) {
  return Effect.gen(function* () {
    const db = yield* DrizzleDb
    const now = new Date()
    const [user] = yield* db.insert(users).values({
      name: 'Owner', email, role: 'user', createdAt: now, updatedAt: now,
    } as never).returning()
    const [org] = yield* db.insert(organizations).values({
      name: 'Acme', slug, createdAt: now,
    } as never).returning()
    yield* db.insert(members).values({
      organizationId: org.id, userId: user.id, role: 'org:owner', createdAt: now,
    } as never)
    return { userId: user.id as number, orgId: org.id as number }
  })
}

layer(TestLayer)('OrganizationService.createInvitation', (it) => {
  it.effect('creates a pending invitation for a member-inviter', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner1@x.com', 'acme1')
      const svc = yield* OrganizationService
      const inv = yield* svc.createInvitation({
        organizationId: orgId, email: 'invitee@x.com', role: 'org:admin', inviterId: userId,
      })
      expect(inv.status).toBe('pending')
      expect(inv.email).toBe('invitee@x.com')
      expect(inv.organizationId).toBe(orgId)
      expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now())
    }))

  it.effect('rejects a non-member inviter with NotAMember', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { orgId } = yield* seedOrgWithOwner('owner2@x.com', 'acme2')
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: orgId, email: 'x@x.com', role: 'org:admin', inviterId: 999999,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('NotAMember')
    }))

  it.effect('rejects an invalid role with OrgInvalidRole', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner3@x.com', 'acme3')
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: orgId, email: 'x@x.com', role: 'not-a-role', inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('OrgInvalidRole')
    }))

  it.effect('rejects a duplicate pending invitation with InvitationAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner4@x.com', 'acme4')
      const svc = yield* OrganizationService
      yield* svc.createInvitation({ organizationId: orgId, email: 'dup@x.com', role: 'org:admin', inviterId: userId })
      const err = yield* svc.createInvitation({
        organizationId: orgId, email: 'dup@x.com', role: 'org:admin', inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationAlreadyExists')
    }))

  it.effect('rejects inviting an existing member with MemberAlreadyExists', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner5@x.com', 'acme5')
      const svc = yield* OrganizationService
      const err = yield* svc.createInvitation({
        organizationId: orgId, email: 'owner5@x.com', role: 'org:admin', inviterId: userId,
      }).pipe(Effect.flip)
      expect(err._tag).toBe('MemberAlreadyExists')
    }))

  it.effect('resend reuses the pending invitation and refreshes its expiry', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { userId, orgId } = yield* seedOrgWithOwner('owner6@x.com', 'acme6')
      const svc = yield* OrganizationService
      const first = yield* svc.createInvitation({
        organizationId: orgId, email: 're@x.com', role: 'org:admin', inviterId: userId,
      })
      const again = yield* svc.createInvitation({
        organizationId: orgId, email: 're@x.com', role: 'org:admin', inviterId: userId, resend: true,
      })
      expect(again.id).toBe(first.id)
      expect(again.status).toBe('pending')
      // resend refreshed the expiry window
      expect(again.expiresAt.getTime()).toBeGreaterThanOrEqual(first.expiresAt.getTime())
    }))
})
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/organization-invitations.test.ts
```
Expected: FAIL — `svc.createInvitation` is not a function (not on the Tag yet).

- [ ] **Step 3: Add `createInvitation` to the `OrganizationService` Tag**

In `services/organization.ts`, in the `Context.Service` Tag interface, after `cancelInvitation`:

```ts
readonly createInvitation: (input: {
  readonly organizationId: number
  readonly email: string
  readonly role: string
  readonly inviterId: number
  /** When a pending invite already exists: false/omitted → fail
   *  `InvitationAlreadyExists`; true → re-publish `InvitationCreated`
   *  for the existing invite and return it (idempotent re-notify). */
  readonly resend?: boolean
}) => Effect.Effect<
  OrganizationInvitation,
  OrganizationNotFound | NotAMember | OrgInvalidRole | MemberAlreadyExists
  | InvitationAlreadyExists | OrgDbFailed
>
```

- [ ] **Step 4: Implement `createInvitation` in `make`**

Add to the returned `OrganizationService.of({ … })` object (after `cancelInvitation`). Uses the existing in-`make` helpers `findOrgById`, `requireMembership`, `ensureValidRole`, `dbErr`:

```ts
createInvitation: input =>
  Effect.gen(function* () {
    yield* findOrgById(input.organizationId)
    yield* requireMembership(input.organizationId, input.inviterId)
    const validRole = yield* ensureValidRole(input.role)

    const existingMember = yield* dbErr(db.query.members.findFirst({
      where: { organizationId: input.organizationId, user: { email: input.email } },
    }))
    if (existingMember)
      return yield* Effect.fail(new MemberAlreadyExists({ member: existingMember }))

    const pending = yield* dbErr(db.query.invitations.findFirst({
      where: { organizationId: input.organizationId, email: input.email, status: 'pending' },
    }))
    if (pending) {
      if (!input.resend)
        return yield* Effect.fail(new InvitationAlreadyExists())
      // resend: refresh the expiry window on the EXISTING invitation, then
      // re-publish `InvitationCreated` for it. No other column changes.
      const [refreshed] = yield* dbErr(db.update(invitations)
        .set({ expiresAt: new Date(Date.now() + Duration.toMillis(INVITATION_DURATION)) })
        .where(eq(invitations.id, pending.id))
        .returning())
      if (!refreshed)
        return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation resend update returned no row' }))
      yield* Effect.forkDetach(events.publish({
        _tag: 'InvitationCreated',
        invitationId: refreshed.id,
        orgId: input.organizationId,
        email: input.email,
        role: refreshed.role ?? (validRole as string),
        inviterId: refreshed.inviterId,
      }))
      return refreshed
    }

    const now = new Date()
    const [invitation] = yield* dbErr(db.insert(invitations).values({
      organizationId: input.organizationId,
      email: input.email,
      role: validRole as string,
      status: 'pending',
      inviterId: input.inviterId,
      expiresAt: new Date(now.getTime() + Duration.toMillis(INVITATION_DURATION)),
      createdAt: now,
    }).returning())
    if (!invitation)
      return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation insert returned no row' }))

    yield* Effect.forkDetach(events.publish({
      _tag: 'InvitationCreated',
      invitationId: invitation.id,
      orgId: input.organizationId,
      email: input.email,
      role: validRole as string,
      inviterId: input.inviterId,
    }))
    return invitation
  }),
```

Add the imports the file may lack: `INVITATION_DURATION` from `../constants`, `Duration` from `effect` (the file already imports `Effect`, `Layer`, etc. — add `Duration` to that import if absent). `invitations` is already imported (used by `cancelInvitation`).

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/organization-invitations.test.ts
```
Expected: the 5 `createInvitation` tests pass.

- [ ] **Step 6: Type-check + stage**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
git add packages/modules/auth/src
```
Expected: check-types at the Task 1 baseline.

---

## Task 3: `OrganizationService.acceptInvitation`

**Files:**
- Modify: `packages/modules/auth/src/services/organization-invitations.test.ts`
- Modify: `packages/modules/auth/src/services/organization.ts`

`acceptInvitation` inserts a `members` row and flips the invitation to `accepted` **in one transaction** (effect-postgres `db.transaction`, the form `create` already uses).

- [ ] **Step 1: Write failing `acceptInvitation` tests**

Append to `organization-invitations.test.ts`. Add a helper for seeding an invited user + a pending invitation, then the cases:

```ts
// Seed: an org with an owner, a separate invited user, and a pending invitation.
function seedInvitation(opts: {
  ownerEmail: string, slug: string, inviteeEmail: string,
  role?: string, status?: string, expiresAt?: Date,
}) {
  return Effect.gen(function* () {
    const db = yield* DrizzleDb
    const now = new Date()
    const { userId: ownerId, orgId } = yield* seedOrgWithOwner(opts.ownerEmail, opts.slug)
    const [invitee] = yield* db.insert(users).values({
      name: 'Invitee', email: opts.inviteeEmail, role: 'user', createdAt: now, updatedAt: now,
    } as never).returning()
    const [inv] = yield* db.insert(invitations).values({
      organizationId: orgId, email: opts.inviteeEmail, role: opts.role ?? 'org:admin',
      status: opts.status ?? 'pending',
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000),
      inviterId: ownerId, createdAt: now,
    } as never).returning()
    return { orgId, inviteeId: invitee.id as number, invitationId: inv.id as number }
  })
}

layer(TestLayer)('OrganizationService.acceptInvitation', (it) => {
  it.effect('creates the member and marks the invitation accepted', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { orgId, inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o1@x.com', slug: 'a1', inviteeEmail: 'i1@x.com',
      })
      const svc = yield* OrganizationService
      const { invitation, member } = yield* svc.acceptInvitation(invitationId, inviteeId)
      expect(member.organizationId).toBe(orgId)
      expect(member.userId).toBe(inviteeId)
      expect(invitation.id).toBe(invitationId)
      expect(invitation.status).toBe('accepted')
    }))

  it.effect('rejects an expired invitation with InvitationExpired', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o2@x.com', slug: 'a2', inviteeEmail: 'i2@x.com',
        expiresAt: new Date(Date.now() - 1000),
      })
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationExpired')
    }))

  it.effect('rejects a non-pending invitation with InvitationNotPending', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o3@x.com', slug: 'a3', inviteeEmail: 'i3@x.com', status: 'cancelled',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotPending')
    }))

  it.effect('rejects a mismatched accepting user with InvitationEmailMismatch', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'o4@x.com', slug: 'a4', inviteeEmail: 'i4@x.com',
      })
      // the owner (a different user/email) tries to accept i4's invitation
      const db = yield* DrizzleDb
      const [owner] = yield* db.select().from(users).where(eq(users.email, 'o4@x.com'))
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(invitationId, owner.id).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationEmailMismatch')
    }))

  it.effect('rejects an unknown invitation id with InvitationNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const svc = yield* OrganizationService
      const err = yield* svc.acceptInvitation(999999, 1).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotFound')
    }))
})
```

- [ ] **Step 2: Run — expect FAIL** (`acceptInvitation` not a function)

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/organization-invitations.test.ts
```

- [ ] **Step 3: Add `acceptInvitation` to the Tag**

```ts
readonly acceptInvitation: (
  invitationId: number,
  userId: number,
) => Effect.Effect<
  { readonly invitation: OrganizationInvitation, readonly member: OrganizationMember },
  InvitationNotFound | InvitationNotPending | InvitationExpired
  | InvitationEmailMismatch | OrgUserNotFound | MemberAlreadyExists | OrgDbFailed
>
```

- [ ] **Step 4: Implement `acceptInvitation` in `make`**

```ts
acceptInvitation: (invitationId, userId) =>
  Effect.gen(function* () {
    const inv = yield* dbErr(db.query.invitations.findFirst({ where: { id: invitationId } }))
    if (!inv)
      return yield* Effect.fail(new InvitationNotFound())
    if (inv.status !== 'pending')
      return yield* Effect.fail(new InvitationNotPending())
    if (inv.expiresAt.getTime() <= Date.now())
      return yield* Effect.fail(new InvitationExpired())

    const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId } }))
    if (!user)
      return yield* Effect.fail(new OrgUserNotFound())
    if (user.email !== inv.email)
      return yield* Effect.fail(new InvitationEmailMismatch())

    const existing = yield* dbErr(db.query.members.findFirst({
      where: { organizationId: inv.organizationId, userId },
    }))
    if (existing)
      return yield* Effect.fail(new MemberAlreadyExists({ member: existing }))

    const result = yield* dbErr(db.transaction(tx =>
      Effect.gen(function* () {
        const [m] = yield* tx.insert(members).values({
          organizationId: inv.organizationId,
          userId,
          role: inv.role ?? 'org:member',
          createdAt: new Date(),
        }).returning()
        if (!m)
          return yield* Effect.fail(new Error('member insert returned no row'))
        const [accepted] = yield* tx.update(invitations)
          .set({ status: 'accepted' })
          .where(eq(invitations.id, invitationId))
          .returning()
        if (!accepted)
          return yield* Effect.fail(new Error('invitation update returned no row'))
        return { member: m, invitation: accepted }
      }),
    ))

    yield* Effect.forkDetach(events.publish({
      _tag: 'MemberAdded', orgId: inv.organizationId, userId, role: result.member.role,
    }))
    yield* Effect.forkDetach(events.publish({
      _tag: 'InvitationAccepted', invitationId, orgId: inv.organizationId, userId,
    }))
    return result
  }),
```

- [ ] **Step 5: Run — expect PASS**, then **Step 6: type-check + `git add packages/modules/auth/src`** (baseline unchanged).

---

## Task 4: `OrganizationService.rejectInvitation`

**Files:**
- Modify: `packages/modules/auth/src/services/organization-invitations.test.ts`
- Modify: `packages/modules/auth/src/services/organization.ts`

- [ ] **Step 1: Write failing `rejectInvitation` tests**

Append to `organization-invitations.test.ts` (reuses `seedInvitation`):

```ts
layer(TestLayer)('OrganizationService.rejectInvitation', (it) => {
  it.effect('marks a pending invitation rejected', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o5@x.com', slug: 'r1', inviteeEmail: 'i5@x.com',
      })
      const svc = yield* OrganizationService
      const rejected = yield* svc.rejectInvitation(invitationId, inviteeId)
      expect(rejected.id).toBe(invitationId)
      expect(rejected.status).toBe('rejected')
    }))

  it.effect('rejects a mismatched user with InvitationEmailMismatch', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { invitationId } = yield* seedInvitation({
        ownerEmail: 'o6@x.com', slug: 'r2', inviteeEmail: 'i6@x.com',
      })
      const db = yield* DrizzleDb
      const [owner] = yield* db.select().from(users).where(eq(users.email, 'o6@x.com'))
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(invitationId, owner.id).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationEmailMismatch')
    }))

  it.effect('rejects a non-pending invitation with InvitationNotPending', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const { inviteeId, invitationId } = yield* seedInvitation({
        ownerEmail: 'o7@x.com', slug: 'r3', inviteeEmail: 'i7@x.com', status: 'accepted',
      })
      const svc = yield* OrganizationService
      const err = yield* svc.rejectInvitation(invitationId, inviteeId).pipe(Effect.flip)
      expect(err._tag).toBe('InvitationNotPending')
    }))
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add `rejectInvitation` to the Tag**

```ts
readonly rejectInvitation: (
  invitationId: number,
  userId: number,
) => Effect.Effect<
  OrganizationInvitation,
  InvitationNotFound | InvitationNotPending | InvitationEmailMismatch
  | OrgUserNotFound | OrgDbFailed
>
```

- [ ] **Step 4: Implement `rejectInvitation` in `make`**

```ts
rejectInvitation: (invitationId, userId) =>
  Effect.gen(function* () {
    const inv = yield* dbErr(db.query.invitations.findFirst({ where: { id: invitationId } }))
    if (!inv)
      return yield* Effect.fail(new InvitationNotFound())
    if (inv.status !== 'pending')
      return yield* Effect.fail(new InvitationNotPending())

    const user = yield* dbErr(db.query.users.findFirst({ where: { id: userId } }))
    if (!user)
      return yield* Effect.fail(new OrgUserNotFound())
    if (user.email !== inv.email)
      return yield* Effect.fail(new InvitationEmailMismatch())

    const [rejected] = yield* dbErr(db.update(invitations)
      .set({ status: 'rejected' })
      .where(eq(invitations.id, invitationId))
      .returning())
    if (!rejected)
      return yield* Effect.fail(new OrgDbFailed({ cause: 'invitation update returned no row' }))
    yield* Effect.forkDetach(events.publish({
      _tag: 'InvitationRejected', invitationId, orgId: inv.organizationId,
    }))
    return rejected
  }),
```

- [ ] **Step 5: Run — expect PASS.** **Step 6: type-check + `git add packages/modules/auth/src`.**

---

## Task 5: `SessionService.update`

**Files:**
- Modify: `packages/modules/auth/src/services/session.test.ts`
- Modify: `packages/modules/auth/src/services/session.ts`

- [ ] **Step 1: Write the failing `update` test**

Append to the existing (passing) `services/session.test.ts`, inside its `layer(TestLayer)(…)` block (match the file's existing structure — it already builds `SessionService` over `AuthPostgresLayer` + memory persistence):

```ts
it.effect('update patches a session field and the next resolve sees it', () =>
  Effect.gen(function* () {
    yield* truncateAuth
    const db = yield* DrizzleDb
    const now = new Date()
    const [user] = yield* db.insert(users).values({
      name: 'U', email: 'su@x.com', role: 'user', createdAt: now, updatedAt: now,
    } as never).returning()
    const svc = yield* Session.SessionService
    const { token } = yield* svc.create({ userId: user.id })
    yield* svc.update(token, { activeOrganizationId: '42' })
    const resolved = yield* svc.resolve(token)
    expect(resolved?.session.activeOrganizationId).toBe('42')
  }))
```

(If `session.test.ts` does not already import `users` / `DrizzleDb`, add them.)

- [ ] **Step 2: Run — expect FAIL** (`svc.update` not a function)

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run src/services/session.test.ts
```

- [ ] **Step 3: Add `update` to the `SessionService` Tag**

In `services/session.ts`, in the `Context.Service` interface (after `purgeExpired`):

```ts
readonly update: (
  token: string,
  patch: Partial<SessionRow>,
) => Effect.Effect<void, SessionStoreFailed>
```

- [ ] **Step 4: Implement `update` in `make`**

Add to the returned `SessionService.of({ … })` object — modeled exactly on `revoke` (DB write, then cache invalidate):

```ts
update: (token, patch) =>
  dbErr(db.update(sessions).set(patch).where(eq(sessions.token, token))).pipe(
    Effect.andThen(
      cache.invalidate(new SessionKey({ token })).pipe(
        Effect.mapError(cause => new SessionStoreFailed({ cause })),
      ),
    ),
  ),
```

- [ ] **Step 5: Run — expect PASS** (the new test + all existing session tests stay green).

- [ ] **Step 6: type-check + `git add packages/modules/auth/src`.**

---

## Task 6: Authorization rework — org-scoped `permission` authScope

**Scope expansion (flagged for review).** This task is not one of the "5 deferred mutations" — it is required infrastructure. The pre-SP2 `permission` authScope authorizes against the caller's *session* active org (`auth.session.activeOrganizationId`), never the mutation's target `input.organizationId`, and never checks org membership. A user with a permission in org A can act on org B; a non-member is never rejected. SP2 must fix this before shipping `inviteMember` / `removeMember`. See Notes / risks → "Authorization rework".

**Files:**
- Modify: `packages/modules/auth/src/graphql/index.ts` — `BuilderAuthScopes` augmentation.
- Modify: `packages/modules/auth/src/graphql/scopes.ts` — `auth` scope + `permission` rework.
- Modify: `packages/modules/auth/src/services/organization.ts` — add `findFirstMember`; change `removeMember` input.
- Modify: `packages/modules/auth/src/graphql/schema/organization/mutations.ts` — delete the phase-2 comment; function-form `authScopes` on existing org mutations; `removeMember` input.

This task is refactor + infra; no new behaviour is tested directly here — the org-scoped `permission` path is exercised by the `inviteMember` mutation test in Task 7 (non-member / under-privileged → rejected).

- [ ] **Step 1: Delete the phase-2 deferral comment**

In `mutations.ts`, remove the `// ─── better-auth-backed mutations (phase 2) ───` comment block (lines ~268–278) — Tasks 7–9 replace it.

- [ ] **Step 2: Augment `BuilderAuthScopes`**

In `graphql/index.ts`, extend the augmentation — add the boolean `auth` scope and an optional `organization` on `permission`:

```ts
interface BuilderAuthScopes {
  auth: boolean
  permission: {
    resource: string
    actions: string[]
    organization?: number
  }
}
```

- [ ] **Step 3: Add `OrganizationService.findFirstMember`**

The reworked `permission` scope needs to look up a member. Add a generic, config-driven finder — the singular sibling of the existing `listMembers(organizationId, config?)`, modeled on `findFirst` (fails when absent).

Add the config type alias next to `MemberFindManyConfig`:

```ts
type MemberFindFirstConfig = Parameters<Database<Relations>['query']['members']['findFirst']>[0]
```

Add to the `OrganizationService` contract (Tag interface) and impl, placed beside `listMembers`:

```ts
readonly findFirstMember: (
  organizationId: number,
  config?: MemberFindFirstConfig,
) => Effect.Effect<OrganizationMember, MemberNotFound | OrgDbFailed>
```

Impl — merge `organizationId` into the `where` (like `listMembers`), fail when absent (like `findFirst`):

```ts
findFirstMember: (organizationId, config) =>
  Effect.gen(function* () {
    const merged = { ...config, where: { ...config?.where, organizationId } }
    const row = yield* dbErr(db.query.members.findFirst(merged))
    if (!row)
      return yield* Effect.fail(new MemberNotFound())
    return row
  }),
```

- [ ] **Step 4: Rework `scopes.ts`**

Add the boolean `auth` scope, and rework `permission`: when `organization` is supplied, resolve the actor's member role in **that** org and authorize against it — no member row, or a roleless member → `false`, with **no** global fallback. When `organization` is absent (non-org permission checks elsewhere), the existing session-based behaviour is kept.

```ts
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { AuthService } from '../services/auth'
import { OrganizationService } from '../services/organization'

export function authScopes(ctx: GraphQLContextMap) {
  return {
    auth: !!ctx?.auth?.user,
    permission: async (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      if (!userId)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          if (organization != null) {
            // Org-scoped: authorize against the TARGET org using the actor's
            // member role IN that org. Non-member / roleless member → deny.
            const orgSvc = yield* OrganizationService
            const membership = yield* orgSvc.findFirstMember(organization, {
              where: { userId: Number(userId) },
            }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
            if (!membership?.role)
              return false
            const authSvc = yield* AuthService
            return yield* authSvc.hasPermission(
              { userId: String(userId), organizationId: String(organization), role: membership.role },
              { [resource]: actions },
            )
          }
          // No org context — unchanged session-based check.
          const authSvc = yield* AuthService
          return yield* authSvc.hasPermission(
            {
              userId: String(userId),
              organizationId: ctx.auth?.session?.activeOrganizationId ?? undefined,
              role: ctx.auth?.user?.role ?? undefined,
            },
            { [resource]: actions },
          )
        }),
      )
    },
  }
}
```

> `hasPermission` / `checkOrgPermission` / `checkUserPermission` are **not** changed. The scope short-circuits to `false` before calling `hasPermission` whenever there is no member role, so `hasPermission`'s `if (organizationId && role)` routing never sees a missing role and never wrongly falls back to the global `checkUserPermission`. Non-org callers of `hasPermission` (e.g. `user/mutations.ts`) are untouched. Consequence: a globally-privileged user who is not a member of the target org is denied — intended; if a super-admin override is ever wanted, add it explicitly.

- [ ] **Step 5: `removeMember` service — explicit `memberId`**

`removeMember`'s `identifier` is matched ambiguously as member-id **or** user-id via `OR: [{ id }, { user: { id } }]`. `members.id` and `users.id` are disjoint serial spaces that overlap, so a numeric id can resolve to the wrong member. Replace it with an explicit member-id.

In `services/organization.ts`, change `RemoveOrgMemberInput`:

```ts
interface RemoveOrgMemberInput {
  memberId: number
  organizationId: number
}
```

In the `removeMember` impl, drop the `isEmail` / `OR` block — resolve directly:

```ts
const member = yield* dbErr(
  db.query.members.findFirst({ where: { id: memberId, organizationId } }),
)
if (!member)
  return yield* Effect.fail(new MemberNotFound())
```

The last-owner guard (`creatorRole` / `CannotRemoveLastOwner`) and the delete are unchanged. Email-based removal is dropped — deliberate API change, see Notes / risks.

- [ ] **Step 6: Convert existing org mutations to function-form `authScopes`**

Each `permission`-gated mutation targeting an `input.organizationId` must pass that org into the scope. Convert each from the static form to the function form:

```ts
authScopes: (_parent, args, _ctx) => ({
  permission: {
    resource: 'organization',
    actions: ['<existing action>'],
    organization: Number(decodeGlobalID(args.input.organizationId).id),
  },
}),
```

Apply to: `updateOrganization`, `deleteOrganization`, the existing invite mutation, `updateMemberRole`, and `removeMember`. **Leave `createOrganization` unchanged** — it creates an org, so it has no target org; its check stays org-less and uses the scope's `organization == null` branch.

Also update the `removeMember` **mutation** to match Step 5: replace the `identifier: t.string({ required: true })` input field with `memberId: t.id({ required: true })`, `decodeGlobalID` it, drop the `@`/email branch, and pass `{ memberId, organizationId }` to the service.

> Verify each mutation's input actually carries `organizationId` (decode whatever field holds the org id); confirm `updateMemberRole`'s input field name. Confirm the `authScopes` function signature `(parent, args, context)` and the `args.input.*` shape against `@pothos/plugin-scope-auth`.

- [ ] **Step 7: Type-check** — `cd /workspace/c-zo/packages/modules/auth && pnpm check-types` — at the Task 1 baseline, no NEW errors.

- [ ] **Step 8: Stage** — `git add packages/modules/auth/src`.

---

## Task 7: GraphQL mutation — `inviteMember`

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/organization/mutations.ts`
- Modify: `packages/modules/auth/src/graphql/schema/organization/errors.ts` (re-export check)

- [ ] **Step 1: Add the `inviteMember` mutation**

In `registerOrganizationMutations`, add it (modeled on the `removeMember` `relayMutationField` as converted in Task 6). Import the error classes from `./errors` (all already exported: `InvitationAlreadyExists`, `MemberAlreadyExists`, `OrganizationNotFound`, `NotAMember`, `OrgInvalidRole`). The `authScopes` uses the **function form** (Task 6) so the `permission` scope authorizes against the *target* org:

```ts
builder.relayMutationField(
  'inviteMember',
  {
    inputFields: t => ({
      organizationId: t.id({ required: true }),
      email: t.string({ required: true }),
      role: t.string({ required: true }),
      resend: t.boolean({ required: false }),
    }),
  },
  {
    errors: { types: [OrganizationNotFound, NotAMember, OrgInvalidRole, MemberAlreadyExists, InvitationAlreadyExists] },
    authScopes: (_parent, args, _ctx) => ({
      permission: {
        resource: 'organization',
        actions: ['invite-member'],
        organization: Number(decodeGlobalID(args.input.organizationId).id),
      },
    }),
    resolve: async (_root, { input }, ctx) => {
      // The `permission` authScope (Task 6) rejects anonymous requests,
      // non-members, and members lacking `invite-member` in THIS org before
      // `resolve` runs — so `ctx.auth!.user!` is sound.
      const { id: orgId } = decodeGlobalID(input.organizationId)
      const invitation = await ctx.runEffect(
        Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.createInvitation({
            organizationId: Number(orgId),
            email: input.email,
            role: input.role,
            inviterId: Number(ctx.auth!.user!.id),
            resend: input.resend ?? undefined,
          })
        }),
      )
      return { invitation }
    },
  },
  {
    outputFields: t => ({
      invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
    }),
  },
)
```

> Verify the `'invite-member'` action string is valid for the `organization` resource in the auth-scope role config; if not, use the closest existing action. The `Invitation` GraphQL object type already exists (`types.ts`). Confirm the `authScopes` function signature `(parent, args, context)` and the `args.input` shape against the existing mutations converted in Task 6.

- [ ] **Step 2: Type-check**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm check-types
```
Expected: baseline unchanged.

- [ ] **Step 3: Mutation test**

Add an integration test for `inviteMember` (create the org mutation test file `graphql/schema/organization/mutations.test.ts` if none exists; otherwise extend it). Follow whatever pattern existing GraphQL mutation tests in the repo use (a built schema + an executed operation). Cover: a member with `invite-member` invites successfully; an anonymous request is rejected; a member of another org — or a member without the permission — is rejected by the `permission` authScope (not by a resolver error). If no GraphQL-mutation test harness exists in the repo to model, report DONE_WITH_CONCERNS noting the gap rather than inventing a harness.

- [ ] **Step 4: Stage** — `git add packages/modules/auth/src`.

---

## Task 8: GraphQL mutations — `acceptInvitation` & `rejectInvitation`

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/organization/mutations.ts`

- [ ] **Step 1: Add `acceptInvitation`**

```ts
builder.relayMutationField(
  'acceptInvitation',
  { inputFields: t => ({ invitationId: t.id({ required: true }) }) },
  {
    errors: { types: [InvitationNotFound, InvitationNotPending, InvitationExpired, InvitationEmailMismatch, MemberAlreadyExists] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      // `auth` authScope (Task 6) rejects anonymous requests before
      // `resolve` runs, so `ctx.auth!.user!` below is sound.
      const { id: invitationId } = decodeGlobalID(input.invitationId)
      const { invitation, member } = await ctx.runEffect(
        Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.acceptInvitation(Number(invitationId), Number(ctx.auth!.user!.id))
        }),
      )
      return { invitation, member }
    },
  },
  {
    outputFields: t => ({
      invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }),
      member: t.field({ type: 'Member', resolve: p => p.member }),
    }),
  },
)
```

- [ ] **Step 2: Add `rejectInvitation`**

```ts
builder.relayMutationField(
  'rejectInvitation',
  { inputFields: t => ({ invitationId: t.id({ required: true }) }) },
  {
    errors: { types: [InvitationNotFound, InvitationNotPending, InvitationEmailMismatch] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const { id: invitationId } = decodeGlobalID(input.invitationId)
      const invitation = await ctx.runEffect(
        Effect.gen(function* () {
          const svc = yield* OrganizationService
          return yield* svc.rejectInvitation(Number(invitationId), Number(ctx.auth!.user!.id))
        }),
      )
      return { invitation }
    },
  },
  { outputFields: t => ({ invitation: t.field({ type: 'Invitation', resolve: p => p.invitation }) }) },
)
```

Ensure `InvitationNotFound`, `InvitationNotPending`, `InvitationExpired`, `InvitationEmailMismatch` are imported from `./errors` (all are exported there after Task 1 Step 5 — `InvitationNotFound`/`InvitationExpired` pre-existed; the two new ones were added).

- [ ] **Step 3: Type-check** — baseline unchanged.

- [ ] **Step 4: Mutation tests** — `acceptInvitation` (happy + expired→GraphQL error), `rejectInvitation` (happy), following the Task 7 Step 3 harness decision.

- [ ] **Step 5: Stage** — `git add packages/modules/auth/src`.

---

## Task 9: GraphQL mutations — `setActiveOrganization` & `leaveOrganization`

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/organization/mutations.ts`

- [ ] **Step 1: Add `leaveOrganization`**

`removeMember` (Task 6 Step 5) now takes an explicit `memberId`, so `leaveOrganization` first resolves the caller's own membership via `OrganizationService.findFirstMember` (Task 6 Step 3), then removes it — reusing `removeMember`'s last-owner guard (`CannotRemoveLastOwner`). `findFirstMember` fails `MemberNotFound` when the caller is not in the org — that error is in the `errors` list, so it surfaces as a GraphQL error with no extra check. Gated by the `auth` authScope (logged-in: you may always attempt to leave your own org).

```ts
builder.relayMutationField(
  'leaveOrganization',
  { inputFields: t => ({ organizationId: t.id({ required: true }) }) },
  {
    errors: { types: [MemberNotFound, CannotRemoveLastOwner] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const { id: orgId } = decodeGlobalID(input.organizationId)
      await ctx.runEffect(
        Effect.gen(function* () {
          const svc = yield* OrganizationService
          const membership = yield* svc.findFirstMember(Number(orgId), {
            where: { userId: Number(ctx.auth!.user!.id) },
          })
          return yield* svc.removeMember({
            memberId: membership.id,
            organizationId: Number(orgId),
          })
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)
```

- [ ] **Step 2: Add `setActiveOrganization`**

Coordinates two services: validate membership via `OrganizationService.checkMembership`, then patch the session via `SessionService.update`. `organizationId` is nullable (passing `null` clears the active org). `activeOrganizationId` is a `text` column → write `String(orgId)`.

```ts
builder.relayMutationField(
  'setActiveOrganization',
  { inputFields: t => ({ organizationId: t.id({ required: false }) }) },
  {
    errors: { types: [NotAMember] },
    authScopes: { auth: true },
    resolve: async (_root, { input }, ctx) => {
      const orgId = input.organizationId
        ? Number(decodeGlobalID(input.organizationId).id)
        : null
      const token = ctx.auth!.session!.token
      const userId = Number(ctx.auth!.user!.id)
      await ctx.runEffect(
        Effect.gen(function* () {
          if (orgId !== null) {
            const org = yield* OrganizationService
            const isMember = yield* org.checkMembership(orgId, userId)
            if (!isMember)
              return yield* Effect.fail(new NotAMember())
          }
          const session = yield* SessionService
          yield* session.update(token, {
            activeOrganizationId: orgId === null ? null : String(orgId),
          })
        }),
      )
      return { success: true }
    },
  },
  { outputFields: t => ({ success: t.boolean({ resolve: p => p.success }) }) },
)
```

Add the import for `SessionService` — import it the **same way `mutations.ts` already imports `OrganizationService`** (inspect the file: post-SP-A it is a deep import from the service file, e.g. `import { SessionService } from '../../../services/session'`), and reference it as a bare `SessionService` Tag inside the resolver, exactly like `OrganizationService`. `NotAMember` / `MemberNotFound` / `CannotRemoveLastOwner` come from `./errors`.

> Note on `ctx.auth!.session!`: the `auth` authScope guarantees `ctx.auth.user`, not `ctx.auth.session` — they are independently nullable in `AuthContext`. The `session!` assertion is sound because a real authenticated request populates both from one `ResolvedSession`; if stricter typing is preferred, narrow `session` inline instead of asserting.
>
> Verify: `ctx.auth.session` carries `token` (the `ResolvedSession.session` is the `SessionRow`, which has `token`). If `ctx.auth` typing does not expose `token`, surface it — the `AuthContext` type may need the `session` field's type widened (a small `graphql/index.ts` change). `SessionStoreFailed` from `session.update` is not in the `errors` list — it propagates as a generic GraphQL error (a 503-class infra failure); acceptable.

- [ ] **Step 3: Type-check** — baseline unchanged.

- [ ] **Step 4: Mutation tests** — `leaveOrganization` (happy + last-owner→`CannotRemoveLastOwner`), `setActiveOrganization` (happy: member; non-member→`NotAMember`; `null` clears).

- [ ] **Step 5: Stage** — `git add packages/modules/auth/src`.

---

## Task 10: Final verification

- [ ] **Step 1: Type-check** — `cd /workspace/c-zo/packages/modules/auth && pnpm check-types` — at the Task 1 baseline, no NEW errors.

- [ ] **Step 2: Run the SP2 + regression suites**

```bash
cd /workspace/c-zo/packages/modules/auth && pnpm vitest run \
  src/services/organization-invitations.test.ts \
  src/services/session.test.ts \
  src/services/password.test.ts src/services/cookie.test.ts \
  src/http/credential.test.ts src/graphql/session-context.test.ts
```
Expected: the new `organization-invitations` suite passes; the SP1 suites still pass (regression gate). If a `mutations.test.ts` was created, include it.

- [ ] **Step 3: Confirm no better-auth crept in**

```bash
git grep -n "BetterAuth\|better-auth" packages/modules/auth/src/services/organization.ts packages/modules/auth/src/graphql/schema/organization/mutations.ts
```
Expected: nothing — SP2 is better-auth-free.

- [ ] **Step 4: Stage everything**

```bash
git add packages/modules/auth/src
git status --short
```
Leave staged and uncommitted — the user runs the final review and commits SP2 as one unit.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §3.1 `createInvitation` | Task 2 |
| §3.2 `acceptInvitation` | Task 3 |
| §3.3 `rejectInvitation` | Task 4 |
| §3.4 `SessionService.update` | Task 5 |
| §3.5 invitation event variants | Task 1 (Step 4) |
| §3.6 5 GraphQL mutations | Tasks 7, 8, 9 |
| §3.7 `OrganizationInvitationData` input | Tasks 7–9 — realized as inline `inputFields` per the codebase pattern (deliberate deviation, see File Structure note) |
| §3.8 new tagged errors | Task 1 (Steps 3, 5) |
| §3.9 / §4.5 invitation-uniqueness partial index | Task 1 (Steps 6–7) |
| §4 service-method flows | Tasks 2–4 |
| §5 errors | Task 1 (only `InvitationNotPending` + `InvitationEmailMismatch` are new — the rest already exist) |
| §6 `OrganizationEvents` variants | Task 1 |
| §7 `SessionService.update` | Task 5 |
| §8 GraphQL mutations | Tasks 7–9 |
| §9 testing | Tasks 2–9 (per-method) + Task 10 |
| §11 file layout | File Structure |
| §12.1 confirm existing errors | Task 1 (done — see Conventions) |
| §12.2 `addMember` reuse | Task 3 — `acceptInvitation` is self-contained transactional (does NOT call `addMember`, which is non-transactional); reuses the `members` insert shape only |
| §12.3 transaction shape | Task 3 (Step 4) |
| §12.4 `relayMutationField` style | Tasks 7–9 (confirmed: `relayMutationField`) |
| §12.5 `setActiveOrganization` return | Task 9 — returns `{ success: boolean }` (the existing org mutations' payload pattern) rather than the `Organization` the spec floated; simpler and consistent |
| Authorization rework — org-scoped `permission` authScope (not in source spec) | Task 6 — SP2 scope expansion, see Notes / risks |

## Notes / risks

- **Spec deviations (flagged for plan review):**
  1. §3.7 — `inviteMember` inlines its `inputFields` (like every other org mutation) instead of resurrecting the dead `registerOrganizationInputs`/`OrganizationInvitationData`. Consistency with the codebase.
  2. §12.5 — `setActiveOrganization` returns `{ success: true }` (the org mutations' uniform payload shape), not the resolved `Organization`.
  3. §4.2 — `acceptInvitation` does **not** call the existing `addMember` (it is non-transactional and self-publishes `MemberAdded`); instead it does its own transactional member-insert + invitation-update and publishes both events itself. This honours the spec's "one transaction" requirement.
- **Authorization rework (Task 6 — SP2 scope expansion).** The pre-SP2 `permission` authScope authorized against the caller's *session* active org, never the mutation's target org, and never checked membership — so a permission held in org A authorized an action on org B, and a non-member was never rejected. Task 6 converts every `permission`-gated org mutation's `authScopes` to the function form, passes the target `organization` into the scope, and has the scope resolve the actor's *member role in that org* (no member row → deny, no global fallback). `createOrganization` is exempt (it has no target org). `hasPermission` itself is unchanged. This is beyond SP2's stated scope ("5 deferred mutations") but required — `inviteMember` / `removeMember` would otherwise ship the hole.
- **`removeMember` API change.** Both the service input and the GraphQL mutation input drop the ambiguous `identifier` (matched as member-id **or** user-id over overlapping serial ID spaces) for an explicit `memberId`. **Email-based removal is dropped** — confirmed deliberate; frontend usage was not verified.
- **The auth test suites that import `@czo/kit/effect`** (the legacy `organization.test.ts`, `layers/*.test.ts`) remain un-runnable — pre-existing, out of scope. SP2's new tests use SP1's working `@effect/vitest` + Testcontainers pattern and DO run.
- **Invitation uniqueness is now DB-enforced.** Task 1 adds a partial unique index `invitations (organization_id, email) WHERE status='pending'`, so at most one pending invitation per `(org, email)` is guaranteed even under concurrency. `createInvitation`'s app-level pre-check stays for the friendly `InvitationAlreadyExists` error and the `resend` branch; a genuine race that slips past the pre-check is rejected by the index and surfaces as `OrgDbFailed` (consistent with SP1's `signUp`, where a racing email-duplicate surfaces as a DB error). `createInvitation`'s code itself is unchanged by the index — the `dbErr`-wrapped insert already maps any failure, including a unique violation, to `OrgDbFailed`.
- **Migration tooling unverified:** Task 1 Step 7 assumes `pnpm migrate:create` diffs `schema.ts` (drizzle-kit `generate`). If it instead scaffolds an empty migration, the step's fallback is to hand-write the `CREATE UNIQUE INDEX … WHERE status='pending'` SQL — the step covers both.
- `db.transaction` in `acceptInvitation` carries `EffectDrizzleQueryError | SqlError` — the `dbErr` helper's generic `E` absorbs both (per the SP-B effect-postgres findings).
- Testcontainers tests need Docker; the repo runs auth tests against Testcontainers Postgres (SP1 standard).
