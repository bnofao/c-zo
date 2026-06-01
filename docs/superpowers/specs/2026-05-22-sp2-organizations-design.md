# SP2 — Organizations: invitation workflows & active-org

**Date:** 2026-05-22
**Status:** Design approved, pending spec review
**Sub-project:** SP2 of the "drop better-auth, go Effect-native" migration
(follows SP1, and the intermediate refactors SP-B and SP-A).

---

## 1. Context

The SP1 decomposition listed SP2 as "reimplement `OrganizationService` layer on
Drizzle." That is **already done** — `OrganizationService`
(`packages/modules/auth/src/services/organization.ts`, single-file post-SP-A) is
100% Effect-native and Drizzle-direct, with zero `better-auth` dependency. Core
org CRUD, member management, and invitation **reads** + cancellation all work,
and every `/organization/**` REST path is in better-auth's `disabledPaths`.

What actually remains is the set of organization mutations
`graphql/schema/organization/mutations.ts` explicitly defers under a "phase 2"
comment:

```
- inviteMember
- acceptInvitation
- rejectInvitation
- setActiveOrganization
- leaveOrganization
```

SP2 delivers exactly those five — completing the organization feature. All work
is GraphQL + Effect-native; **no `better-auth`, no REST, no DB schema change**
(the `organizations` / `members` / `invitations` tables and the
`sessions.activeOrganizationId` column already exist).

---

## 2. Goal & guarantees

Deliver the five deferred organization mutations and the service/session
surface they need:

- A member can invite an email to an organization; an invited user can accept or
  reject; a member can leave; a member can set their session's active
  organization.
- `OrganizationService` gains `createInvitation` / `acceptInvitation` /
  `rejectInvitation` (it already has `getInvitation` / `listInvitations` /
  `listUserInvitations` / `cancelInvitation`).
- `SessionService` gains a single mutating method, `update`.
- Every existing `OrganizationService` / `SessionService` method and every
  passing test keeps working unchanged.
- `better-auth` is untouched — SP2 changes no `better-auth` config and removes
  nothing (decommission is SP5).

---

## 3. Scope

### In scope

| # | Deliverable |
|---|---|
| 1 | `OrganizationService.createInvitation` + impl + tests |
| 2 | `OrganizationService.acceptInvitation` + impl + tests |
| 3 | `OrganizationService.rejectInvitation` + impl + tests |
| 4 | `SessionService.update` + impl + test |
| 5 | 3 new `OrganizationEvent` variants (invitation lifecycle) |
| 6 | 5 GraphQL mutations: `inviteMember`, `acceptInvitation`, `rejectInvitation`, `setActiveOrganization`, `leaveOrganization` |
| 7 | Register the existing `OrganizationInvitationData` GraphQL input |
| 8 | New invitation tagged errors, each doubling as a Pothos error |
| 9 | A migration: partial unique index on `invitations (organization_id, email) WHERE status='pending'` |

### Out of scope

- **Email delivery / an `EmailEvents` bus.** `createInvitation` publishes an
  `InvitationCreated` domain event; actual email delivery is a separate future
  sub-project. Invitees discover invitations via the existing `myInvitations`
  GraphQL query.
- **The `@czo/kit/effect` restoration.** That module was removed in an earlier
  in-flight migration; ~15 files import the dead path and the *old-style* auth
  test suites (`organization.test.ts`, etc.) cannot collect. SP2 sidesteps this
  entirely by writing its tests in SP1's working `@effect/vitest` pattern (§9);
  fixing the dead path is its own separate task.
- Removing better-auth's organization plugin or any `layers/better-auth/*` (SP5).
- better-auth "teams" — not modelled in the c-zo schema.
- Rewriting the pre-existing broken `services/organization.test.ts`.
- Any DB schema or migration change **other than** the single partial unique
  index of deliverable 9 (§4.5).

---

## 4. `OrganizationService` — three new methods

Added to the existing `OrganizationService` `Context.Service` Tag in
`services/organization.ts`, alongside the current invitation **reads**.

```
createInvitation(input: {
  organizationId: number
  email: string
  role: string
  inviterId: number
  resend?: boolean        // default false — see 4.1 step 5
}): Effect<Invitation,
           OrgNotFound | NotAMember | InvalidRole | AlreadyMember
           | AlreadyInvited | OrgDbFailed>

acceptInvitation(invitationId: number, userId: number):
  Effect<{ invitation: Invitation; member: OrganizationMember },
         InvitationNotFound | InvitationNotPending | InvitationExpired
         | InvitationEmailMismatch | AlreadyMember | OrgDbFailed>

rejectInvitation(invitationId: number, userId: number):
  Effect<Invitation,
         InvitationNotFound | InvitationNotPending
         | InvitationEmailMismatch | OrgDbFailed>
```

`Invitation` and `OrganizationMember` are the existing Drizzle row types
(`InferSelectModel` of `invitations` / `members`).

### 4.1 `createInvitation`

1. Verify the organization exists.
2. Verify `inviterId` is a member of it **and** the inviter's role grants
   `invitation:create` (validated against `AccessService`'s built roles, the
   same `validateRole` path the existing member mutations use).
3. Verify `role` is a valid organization role.
4. Verify `email` is not already a member of the organization (`AlreadyMember`).
5. Check for an existing **pending** invitation for that `email` +
   `organizationId`. If one exists:
   - `resend` is `false`/omitted → fail with `AlreadyInvited`.
   - `resend` is `true` → **refresh & re-notify**: update the existing
     invitation's `expiresAt` to `now + INVITATION_DURATION` (a resend grants
     a fresh window to act on), then re-publish `InvitationCreated` for that
     invitation (its `id` / `role` / `inviterId` — the new call's `role` is
     ignored) and return the refreshed row. Status stays `pending`; no other
     column changes. Steps 6–7 are skipped.

   A previously `cancelled` / `rejected` / `expired` invitation is not
   "pending", so it never short-circuits — a fresh invitation is created.
6. Insert an `invitations` row: `status: 'pending'`, `inviterId`,
   `expiresAt: now + INVITATION_DURATION`, `role`, `email`.
7. Publish `InvitationCreated`.

`INVITATION_DURATION` is a new `Duration` constant in `../constants` (default
**7 days**), mirroring `SESSION_DURATION`.

### 4.2 `acceptInvitation`

1. Load the invitation by id (`InvitationNotFound`).
2. It must be `status: 'pending'` (`InvitationNotPending`) and `expiresAt` must
   be in the future (`InvitationExpired`).
3. Look up the accepting user by `userId`; their `email` must equal the
   invitation's `email` (`InvitationEmailMismatch`) — invitations are tracked by
   email, so the actor must own that email.
4. The user must not already be a member (`AlreadyMember`).
5. **In one transaction:** insert the `members` row with the invitation's
   `role` (the same insert the existing `addMember` performs), and update the
   invitation to `status: 'accepted'` — both `RETURNING` their rows.
6. Publish `InvitationAccepted` and the existing `MemberAdded` event.
7. Return `{ invitation, member }` — the accepted invitation and the new member.

### 4.3 `rejectInvitation`

1. Load the invitation (`InvitationNotFound`); must be `pending`
   (`InvitationNotPending`).
2. The rejecting user's `email` (looked up by `userId`) must match the
   invitation `email` (`InvitationEmailMismatch`).
3. Update the invitation to `status: 'rejected'` (`RETURNING` the row).
4. Publish `InvitationRejected`. Return the rejected invitation.

### 4.4 Notes

- `cancelInvitation` (member-side cancel) already exists and is unchanged;
  `rejectInvitation` is the invitee-side counterpart.
- Member creation in `acceptInvitation` reuses `addMember`'s insert logic — the
  plan decides whether to extract a shared private helper or call the existing
  path; either way the member-count-limit and role-validation behavior of
  `addMember` is preserved.

### 4.5 Invitation-uniqueness — DB backstop

`createInvitation`'s "no existing pending invitation" rule (step 5) is a
read-then-write; under concurrency two `inviteMember` calls for the same
`(organizationId, email)` could both pass the check and both insert. Unlike
SP1's `signUp` — which is backed by the `users.email` `UNIQUE` constraint —
`invitations` currently has **no** uniqueness constraint.

SP2 adds a **partial unique index** as the race-proof backstop:

```sql
CREATE UNIQUE INDEX invitations_org_email_pending_uniq
  ON invitations (organization_id, email)
  WHERE status = 'pending';
```

Because it is `WHERE status = 'pending'`, it constrains **only pending rows** —
historical `accepted` / `rejected` / `cancelled` / expired rows for the same
`(org, email)` are unaffected, so a fresh invitation after a reject/cancel still
works. With the index in place the DB guarantees **at most one pending
invitation per `(organization, email)`**.

The application-level pre-check (step 5) stays — it produces the friendly
`AlreadyInvited` error (and drives the `resend` branch) for the common,
non-concurrent case. A genuine race that slips past the pre-check is rejected by
the index; that insert fails and surfaces as `OrgDbFailed` (consistent with how
SP1's `signUp` lets a racing email-duplicate surface as a DB error rather than
the domain error). The index is added via a Drizzle schema change on the
`invitations` table + a generated migration (§11).

---

## 5. Errors

New `Data.TaggedError`s in `services/organization.ts`, each registered as a
Pothos error via the module's existing `registerError` pattern:

| Error | Raised by | GraphQL/HTTP intent |
|---|---|---|
| `InvitationNotFound` | accept / reject | 404 |
| `InvitationNotPending` | accept / reject (already accepted/rejected/cancelled/expired) | 409 |
| `InvitationExpired` | accept | 410 / 409 |
| `InvitationEmailMismatch` | accept / reject (actor's email ≠ invite email) | 403 |
| `AlreadyInvited` | createInvitation (pending invite exists, `resend` false) | 409 |

`OrgNotFound`, `NotAMember`, `InvalidRole`, `AlreadyMember`, and
`OrgDbFailed` are **reused** from the existing `OrganizationError` union where
they already exist; the plan confirms the exact existing set and only adds what
is genuinely missing. The new errors join the `OrganizationError` union.

---

## 6. `OrganizationEvents` — three new variants

Folded into the existing `OrganizationEvent` union in
`services/events/organization.ts` (no separate bus):

```
InvitationCreated  { invitationId, organizationId, email, role, inviterId }
InvitationAccepted { invitationId, organizationId, userId }
InvitationRejected { invitationId, organizationId }
```

Published fire-and-forget exactly like the existing org/member lifecycle events
(`Effect.forkDetach`-style — a subscriber must never block or fail the
mutation). No subscriber ships in SP2; `InvitationCreated` is the hook a future
email/notification sub-project consumes.

---

## 7. `SessionService.update`

A new — and the first *mutating* — method on the `SessionService` Tag in
`services/session.ts`:

```
update(token: string, patch: Partial<SessionRow>):
  Effect<void, SessionStoreFailed>
```

Implementation: `db.update(sessions).set(patch).where(eq(sessions.token, token))`
through the existing `dbErr` wrapper, **then**
`cache.invalidate(new SessionKey({ token }))` — clearing L1 + L2 so the next
`resolve` re-reads the patched row from L3 (Postgres). Without the invalidate,
the 3-tier `PersistedCache` would serve the pre-patch session for up to the L1
TTL (~30 s).

SP2's only caller patches `{ activeOrganizationId }`; the signature is generic
(`Partial<SessionRow>`) by design decision, but the method does not police which
columns are patched — callers are trusted (it is an internal service method).

---

## 8. HTTP / GraphQL surface — the five mutations

All five land in `graphql/schema/organization/mutations.ts`, replacing the
"phase 2" deferral comment, each following the existing thin-resolver pattern
used by the working org mutations (`createOrganization`, etc.): validate input,
`runEffect(ctx.auth.runtime, <effect>)`, return. All five require an
authenticated `ctx.auth.user` (anonymous → the existing unauthenticated error).

| Mutation | Args | Resolver behavior | Returns |
|---|---|---|---|
| `inviteMember` | `organizationId, email, role, resend?` | `OrganizationService.createInvitation({ …, inviterId: ctx.auth.user.id, resend })` — `resend: true` re-publishes `InvitationCreated` for an existing pending invite instead of erroring | `Invitation` |
| `acceptInvitation` | `invitationId` | `OrganizationService.acceptInvitation(invitationId, ctx.auth.user.id)` | `{ invitation, member }` |
| `rejectInvitation` | `invitationId` | `OrganizationService.rejectInvitation(invitationId, ctx.auth.user.id)` | `Invitation` |
| `setActiveOrganization` | `organizationId` (nullable) | `OrganizationService.checkMembership(organizationId, user.id)` → `NotAMember` if false; then `SessionService.update(ctx.auth.session.token, { activeOrganizationId })`. `null` clears it. | `Organization` or `null` |
| `leaveOrganization` | `organizationId` | `OrganizationService.removeMember` targeting `ctx.auth.user`; the existing `CannotLeaveAsLastOwner` rejects the last owner | `Boolean` |

- `setActiveOrganization` reads the session token from `ctx.auth.session.token`
  — the `SessionRow` carries `token`.
- `leaveOrganization` adds no new service method — it is a thin wrapper over the
  existing `removeMember`, passing the caller as the target.
- The `OrganizationInvitationData` input type already exists in
  `graphql/schema/organization/inputs.ts`; SP2 uncomments
  `registerOrganizationInputs(builder)` in
  `graphql/schema/organization/index.ts` and wires `inviteMember` to it.
- New invitation errors are registered in
  `graphql/schema/organization/errors.ts` via the existing pattern.

---

## 9. Testing — SP1's runnable pattern

SP1's passing suites use `@effect/vitest` (`describe`/`it`/`layer`) + the
Testcontainers helpers `AuthPostgresLayer` / `truncateAuth` from
`src/testing/postgres.ts` — **not** the removed `@czo/kit/effect`. SP2's tests
follow that pattern and therefore run.

| Target | Type | Cases |
|---|---|---|
| `createInvitation` | integration (Testcontainers) | happy path; duplicate pending invite → `AlreadyInvited`; invitee already a member → `AlreadyMember`; invalid role → `InvalidRole`; non-member inviter → `NotAMember` |
| `acceptInvitation` | integration | happy path (member row created, invitation `accepted`); expired → `InvitationExpired`; not pending → `InvitationNotPending`; email mismatch → `InvitationEmailMismatch`; already a member → `AlreadyMember` |
| `rejectInvitation` | integration | happy path (invitation `rejected`); email mismatch; not pending |
| `SessionService.update` | integration | patch `activeOrganizationId`, then `resolve` returns the new value (proves cache invalidation) |
| 5 GraphQL mutations | integration | auth gate (anonymous rejected); membership gate; error → GraphQL error mapping; `leaveOrganization` last-owner → `CannotLeaveAsLastOwner` |

- New file `services/organization-invitations.test.ts` for the three service
  methods (keeps the new tests out of the pre-existing broken
  `organization.test.ts`).
- `SessionService.update` cases are added to the existing, passing
  `services/session.test.ts`.
- Mutation tests co-located per the repo's GraphQL test convention.
- Tests are written first (RED) per the project TDD rule.

---

## 10. Out of scope

See §3. In particular: no email delivery, no `@czo/kit/effect` fix, no
better-auth removal, no rewrite of the legacy broken `organization.test.ts`.
The **only** schema change is the partial unique index of §4.5.

---

## 11. File layout

**Modified:**

```
services/organization.ts              + createInvitation / acceptInvitation /
                                        rejectInvitation + new tagged errors
services/events/organization.ts       + 3 Invitation* event variants
services/session.ts                   + update method
constants.ts                          + INVITATION_DURATION
graphql/schema/organization/mutations.ts   + 5 mutations (drop phase-2 comment)
graphql/schema/organization/index.ts       uncomment registerOrganizationInputs
graphql/schema/organization/errors.ts      register new invitation errors
services/session.test.ts               + update test cases
database/schema.ts                      + partial unique index on `invitations`
```

**New:**

```
services/organization-invitations.test.ts   tests for the 3 new service methods
migrations/<timestamp>_<name>/               generated invitation-uniqueness migration
+ co-located mutation tests
```

**Unchanged:** the `better-auth` config, the existing `OrganizationService` /
`SessionService` methods, the legacy broken `organization.test.ts`, all DB
tables/columns (the only schema delta is the §4.5 partial unique index).

---

## 12. Open items for the planning phase

1. **Exact existing `OrganizationError` set.** §5 reuses `OrgNotFound`,
   `NotAMember`, `InvalidRole`, `AlreadyMember`, `OrgDbFailed` "where they
   exist." The plan reads `services/organization.ts` and confirms which already
   exist vs which must be added (the precise names may differ — e.g. an
   existing member-exists error may be named differently).
2. **`addMember` reuse in `acceptInvitation`.** Whether to extract a shared
   private member-insert helper or call the existing `addMember` path — decided
   in planning against the actual code, preserving member-limit + role checks.
3. **`acceptInvitation` transaction shape** — the effect-postgres transaction
   form (member insert + invitation status update atomically), per the SP-B
   effect-postgres transaction API.
4. **GraphQL mutation field style** — `mutationField` vs `relayMutationField` —
   match whatever the existing org mutations in `mutations.ts` use.
5. **`setActiveOrganization` return shape** — returns the resolved
   `Organization` (or `null` when cleared); confirm the GraphQL type and that
   clearing (`organizationId: null`) is expressible in the schema.
