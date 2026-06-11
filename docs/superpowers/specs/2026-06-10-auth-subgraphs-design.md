# Auth GraphQL sub-graph tagging (account / org / admin) — Design

**Date:** 2026-06-10
**Depends on:** the GraphQL sub-graph **foundation** (`docs/superpowers/specs/2026-06-10-graphql-subgraphs-design.md`, merged on `feat/graphql-subgraphs` / PR #130). That work added `@pothos/plugin-sub-graph` to the kit builder with opt-in/default-none membership, an augmentable `BuilderSubGraphs` (kit seeds `public`; **auth already augments `account`/`org`/`admin`**), root + `PageInfo` + shared-scalar tagging from a threaded `subGraphNames` (= the served set), `buildSchema(subGraph?)`, `dropEmptyRootTypes`, and per-sub-graph serving at `/graphql/<name>`.

## Goal

Tag `@czo/auth`'s full GraphQL surface into the three principal-derived audiences and **serve** `/graphql/account`, `/graphql/org`, `/graphql/admin` from `apps/life` — so each audience's endpoint contains only the operations for that principal. The api-key surface is additionally **split per audience** (see decision 7), taking the count to **13 queries, 37 mutations**. This is the **first consumer that exercises mutations** through sub-graphs, so it validates the two risks the foundation explicitly deferred: the **errors-plugin payload/union type tagging** and **relay `node(id:)` / `Node` interface** per sub-graph.

Authz is unchanged — every field keeps its `authScopes`. Sub-graphs control *exposure*, not *authorization*.

## Decisions (settled during brainstorming)

1. **Scope:** all three audiences (`account`/`org`/`admin`) across all five domains in one spec.
2. **Audience = the actor**, not the code's domain. A logged-in user acting on their own membership/session (`acceptInvitation`/`rejectInvitation`/`leaveOrganization`/`setActiveOrganization`, `myInvitations`/`myApiKeys`) is `account`, even though the resolver lives in the `organization`/`api-key` domain. Org back-office management is `org`. Global platform operations are `admin`.
3. **Anonymous recovery flows stay in `account`.** `requestPasswordReset`/`resetPassword`/`requestEmailVerification`/`verifyEmail` are reachable on `/graphql/account` without a session (v1 endpoints have no transport auth; the field `authScopes` handle the token/no-session case).
4. **No hierarchy.** `admin` does NOT implicitly see `org`/`account` ops — the three audiences are disjoint tags. Multi-membership is used where a single resolver/type genuinely serves two audiences.
5. **Tag + serve** all three now (not tag-only). Serving + a per-audience E2E is the only runtime validation of the deferred risks (Yoga runs `assertValidSchema` per request; Pothos `toSchema()` does not validate).
6. **No new `me`/viewer query** (YAGNI — none exists today; `account` is mutation- + `my*`-centric).
7. **API keys: ops split per audience (not multi-membership), types shared.** Rather than one `createApiKey` carrying an `ApiKeyOwnerInput` USER/ORG discriminator validated at runtime, the api-key surface is **fully partitioned**: each op has an `account` variant (personal key; owner = the session user) and an `org` variant (`organizationId`-scoped). This pushes the owner discriminator from a runtime-validated input union into the schema (two named mutations), giving each audience a **targeted input** (account-create has no `owner`; org-create takes `organizationId`). The `ApiKeyOwnerInput` input and `ApiKeyOwnerType` enum are dropped. The `ApiKey` node and the api-key domain errors stay `account + org` (one entity / one error, viewed by both audiences — multi-membership on a *type* is fine; only multi-membership on an *operation* is the smell being removed). Not `admin`.

## Spike findings (the tagging recipe — validated empirically)

A throwaway spike proved the exact mechanism. **There is no transitive auto-inclusion** — every generated type a tagged mutation references must itself be an explicit member of the sub-graph. `fieldsInheritFromTypes` does NOT help generated types (it only makes an *object's own fields* inherit *that object's* sub-graphs).

`relayMutationField` has a **4-argument** form `(name, inputOptions, fieldOptions, payloadOptions)`. To tag a mutation into sub-graph `x`, **all** of these must carry `subGraphs: ['x']`:

```ts
builder.relayMutationField(
  'updateThing',
  { subGraphs: ['x'], inputFields: t => ({ ... }) },            // tags <Name>Input
  {
    subGraphs: ['x'],                                            // tags the Mutation FIELD
    errors: {
      types: [ValidationError, ThingNotFound],
      union:  { subGraphs: ['x'] },                             // tags <Name>Result (union)
      result: { subGraphs: ['x'] },                             // tags <Name>Success (wrapper)
    },
    resolve: ...,
  },
  { subGraphs: ['x'], outputFields: t => ({ ... }) },           // tags <Name>Payload
)
```

**Gotchas the spike surfaced:**
- **Silent drop:** if the mutation field's *return* type (the result union) is not a member, the **field is silently dropped** from the sub-graph — no error. Under-tagging makes a mutation *vanish* rather than fail loudly. → tests must assert every intended mutation is actually *present* in its audience.
- A referenced **arg/input/union-member** type that is missing throws loudly (`replaceType: "<T> (referenced by <Result>) does not exist in subGraph (x)"`).
- An object implementing an **untagged interface** silently drops the interface (no throw) — so an untagged `Error` interface isn't a build-breaker but costs `... on Error` fidelity. → tag the interface.

## Architecture

### 1. Kit enablement — shared infra into every served sub-graph

These mirror the foundation's "shared infra lives in every known sub-graph" rule (already applied to scalars + relay `PageInfo`). All in `packages/kit/src/graphql/` and threaded from the existing `subGraphNames` param in `setupBuilder`.

- **`registerErrorTypes(builder, subGraphNames)`** (`graphql/errors/builders.ts`): tag the `Error` interface (`.implement({ subGraphs })`), the `FieldError` object (`.implement({ subGraphs })`), and forward `subGraphs: subGraphNames` to every shared-error `registerError(...)` call (`ValidationError`/`NotFoundError`/`ConflictError`/`ForbiddenError`/`UnauthenticatedError`/`OptimisticLockError`). **Load-bearing:** without it, ANY sub-graph mutation referencing a shared error fails to build. Update the single call site in `setupBuilder` (`builder.ts`) to pass `subGraphNames`.
- **`registerError(builder, Cls, { name, fields?, subGraphs? })`**: new optional `subGraphs` forwarded to the underlying `builder.objectType(Cls, { ..., subGraphs })`. Module-local errors (e.g. `UserNotFound`) pass their own audience list. Backward compatible — omitting `subGraphs` keeps today's behavior (member of no named sub-graph → full schema only).
- **Relay config** in `setupBuilder`'s `relay: {...}` block: add `subGraphs: subGraphNames` to `nodeTypeOptions`, `nodeQueryOptions`, and `nodesQueryOptions` (mirrors the existing `pageInfoTypeOptions`). This makes the `Node` interface and the `node(id:)`/`nodes(ids:)` query fields present in each served sub-graph. The existing `resolve` merged into `nodeQueryOptions`/`nodesQueryOptions` (node-guard wiring) is preserved — `subGraphs` is added alongside.

### 2. Audience mapping (the auth tagging)

A field/type MAY belong to several audiences (✦ = multi-membership). A mutation tagged into audience `A` requires its `Input`/`Payload`/`Result`/`Success` + every object type its Payload exposes + every error in `errors.types` to be members of `A` too.

| Audience | Queries | Mutations | Object/relay types | Domain errors |
| --- | --- | --- | --- | --- |
| **admin** | `user`, `users` | `createUser` `updateUser` `removeUser` `banUser` `unbanUser` `setRole` `setUserPassword` `revokeSession` `revokeSessions` `startImpersonation` `stopImpersonation` | `User` (drizzleNode `users`), `Session`, `ImpersonateUserInput` + user inputs/enums (`UserCreateData`/`UserUpdateData`/`UserBanData`/`UserOrderByInput`/`UserOrderField`/`OrderDirection`) | user-domain + impersonation errors (`UserNotFound`, `UserAlreadyExists`, `CannotBanSelf`, `CannotDemoteSelf`, `CannotRemoveSelf`, `UserAlreadyBanned`, `UserNotBanned`, `InvalidRole`, `CredentialLinkFailed`, `PasswordHashFailed`, `UserNoChanges`, impersonation errors) |
| **org** | `organization` `organizations` `members` `checkSlug` `invitation` `invitations` `organizationApiKeys` `organizationApiKey` | `createOrganization` `updateOrganization` `deleteOrganization` `inviteMember` `removeMember` `updateMemberRole` `cancelInvitation` + api-key org variants (`createOrganizationApiKey` `updateOrganizationApiKey` `removeOrganizationApiKey`) | `Organization` (node `organizations`) + org inputs (`OrganizationCreateData`/`OrganizationUpdateData`/`OrganizationInvitationData`) | org-domain errors |
| **account** | `myApiKeys` `apiKey` `myInvitations` | account domain (`changePassword` `requestPasswordReset` `resetPassword` `requestEmailVerification` `verifyEmail` `requestEmailChange` `confirmEmailChange` `deleteAccount` `restoreAccount`) + self org-ops (`acceptInvitation` `rejectInvitation` `leaveOrganization` `setActiveOrganization`) + api-key account variants (`createApiKey` `updateApiKey` `removeApiKey`) | — (uses scalars + shared types + the ✦ types below) | account-domain errors + invitation errors used by accept/reject |
| **✦ account + org** (shared **types**, no shared ops) | — | — | `ApiKey` (node `apikeys`), **`Invitation`** (node `invitations`), **`Member`** (node `members`) | api-key domain errors (`RefillPairRequired`, `ApiKeyNotFound`, `NoChanges`) |

**Why `Invitation` and `Member` are `account + org`:** `acceptInvitation` (account) returns a Payload exposing `invitation: Invitation` **and** `member: Member`; `rejectInvitation` (account) exposes `invitation: Invitation`. The org domain also exposes both (`invitations`/`members`/`inviteMember`/`cancelInvitation`/`removeMember`/`updateMemberRole`). So both nodes are members of `account` and `org`. `leaveOrganization`/`setActiveOrganization` return `{ success: boolean }` only — they pull no org object type into `account`, so `Organization` stays `org`-only.

**Api-key ops are split, not multi-membership.** The single `createApiKey` (owner discriminator) becomes `createApiKey` (account; owner = session user; no `owner` input) + `createOrganizationApiKey` (org; `organizationId` input). `updateApiKey`/`removeApiKey`/`apiKey(id)` similarly gain `…OrganizationApiKey` / `organizationApiKey(id)` org variants (these id-based variants share an identical input shape — the split delivers audience isolation + dedicated `authScopes`, while the *targeted-input* benefit is realized on create). The resolvers fix `ownerType`/`ownerId` per variant; the `ApiKeyService.{create,update,remove}` signatures are unchanged. `ApiKeyOwnerInput` + `ApiKeyOwnerType` are deleted. The `ApiKey` node + api-key domain errors remain `account + org` (one entity / one error).

### 3. Auth-local tagging helper

Given 5 tag points × ~37 mutations and the silent-drop footgun, add a small **auth-local** helper (not kit) that expands one audience into the four option objects:

```ts
// packages/modules/auth/src/graphql/schema/subgraphs.ts
import type { SubGraphName } from '@czo/kit/graphql'

export const sg = (...names: SubGraphName[]) => ({
  field:   { subGraphs: names },
  input:   { subGraphs: names },
  payload: { subGraphs: names },
  errorOpts: { union: { subGraphs: names }, result: { subGraphs: names } },
})
```

Each registrar (`registerUserMutations`, `registerOrganizationMutations`, …) is mostly single-audience, so it spreads `sg('admin')` / `sg('org')` / `sg('account')` (and `sg('account','org')` for the api-key registrar) into its `relayMutationField` arg objects, merging `errorOpts` into the existing `errors` option. Object/relay nodes and input/enum types are tagged on their own `.implement(...)` / `inputType(...)` / `enumType(...)` options. Domain errors are tagged by passing `subGraphs` to their `registerError(...)` calls.

This concentrates a registrar's audience in one place and makes under-tagging hard to do silently.

### 4. node(id:) per audience

Resolved by §1's relay config change (the `Node` interface + `node`/`nodes` fields become members of every served sub-graph). Each drizzleNode is tagged per its audience(s); the kit node-guard registry is keyed by type name and already runs per type, so it works unchanged. An E2E asserts a `node(id:)` for a type tagged into audience `A` resolves on `/graphql/A` and that the type is absent from an audience it isn't tagged into.

### 5. Serving

In `apps/life`, the `buildApp(...)` call passes `subGraphs: ['public', 'account', 'org', 'admin']`. This (a) mounts `/graphql/account`, `/graphql/org`, `/graphql/admin` (alongside the existing `/graphql/public` and the full `/graphql`), and (b) threads all four names into the builder so roots, `PageInfo`, shared scalars, shared errors, and the `Node` interface are tagged into all four. `bootTestApp` already routes `/graphql/<name>` to the matching in-process Yoga.

## Error handling

- **Under-tagging → silent drop:** a mutation missing any of its 5 tag points vanishes from its audience with no error. Mitigated by (a) the `sg()` helper applying all 5 at once, and (b) an E2E per audience that asserts every intended operation is present (not just that unintended ones are absent).
- **Missing arg/union-member type → hard throw** at build, naming the type — caught by the per-audience schema build in tests/serving.
- **Empty root:** every served audience has ≥1 query and ≥1 mutation, so `dropEmptyRootTypes` (foundation) only ever drops the absent `Subscription`; no empty-`Query` case arises.

## Testing

- **Kit unit** (`builder.test.ts`): a regression proving a `relayMutationField` with `errors` tagged into sub-graph `x` (field + input + payload + union + result) **builds and passes `assertValidSchema`**, with `<Name>Input`/`<Name>Payload`/`<Name>Result`/`<Name>Success` present in `x` and absent from `y`; plus a shared-error membership check (a sub-graph mutation referencing `ValidationError` builds because `registerErrorTypes` tagged it). A `node`/`Node`-interface-in-sub-graph regression for the relay config change.
- **Auth E2E per audience** (Testcontainers, via the auth/kit boot harness): for each of `/graphql/account`, `/graphql/org`, `/graphql/admin`: (a) **presence** — every operation mapped to that audience appears in its `__type("Query"/"Mutation")` fields (the silent-drop guard); (b) **isolation** — an operation from another audience is absent (a "Cannot query field" validation error); (c) **one `node(id:)`** for an audience-tagged node resolves, and a non-member node type is absent.

## Out of scope / follow-ups

- Per-endpoint transport auth (e.g. requiring a session on `/graphql/org`); v1 relies on field `authScopes`.
- Retiring the full `/graphql` mount once all audiences are fully tagged and consumers migrated.
- A `me`/viewer query for `account` (none today; add if a consumer needs it).
- Tagging non-auth modules' ops into `org`/`admin` (incremental, per module).
