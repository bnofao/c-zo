# Auth GraphQL sub-graph tagging (account / org / admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag `@czo/auth`'s GraphQL surface (13 queries, 37 `relayMutationField` mutations after the api-key split, their object/relay/error types) into the `account`/`org`/`admin` audiences and serve `/graphql/{account,org,admin}`, validating the mutation-errors-payload and `node(id:)` sub-graph mechanics the foundation deferred.

**Architecture:** Three small kit enablements make sub-graph mutations + `node()` possible (shared error types + relay `Node`/`node` queries tagged into every served sub-graph; `registerError` gains a `subGraphs` option). Auth then tags each mutation via a local `sg()` helper that fills the 5 tag points the spike identified (field + `Input` + `Payload` + error `union` + error `result`), and tags its nodes/inputs/enums/domain-errors per audience. `apps/life` serves the three new endpoints. A per-audience E2E proves presence (silent-drop guard), isolation, and `node(id:)`.

**Tech Stack:** `@pothos/plugin-sub-graph`, `@pothos/plugin-relay`, `@pothos/plugin-errors`, `@pothos/plugin-scope-auth`, graphql-yoga, Effect-TS, Vitest / `@effect/vitest`, Testcontainers.

**Pre-validated:** A throwaway spike pinned the exact recipe (in `docs/superpowers/specs/2026-06-10-auth-subgraphs-design.md` §Spike findings). This plan codifies it. **There is no transitive auto-inclusion** — every generated type a tagged mutation references must be an explicit sub-graph member; an under-tagged mutation is *silently dropped* (no error), so tests assert presence.

**Commit policy:** Stage with `git add` only. Do NOT commit, push, branch, or stash. One commit at the very end after the user reviews. Branch is `feat/auth-subgraphs` (off `main`, which now includes the merged foundation, PR #130). Its own PR at the end.

**Build note:** the auth E2E imports `@czo/kit` from its built `dist/`. After ANY change under `packages/kit/`, run `pnpm --filter @czo/kit build` before running the auth E2E.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/kit/src/graphql/errors/builders.ts` | `registerErrorTypes(builder, subGraphNames)` tags shared error types; `registerError` gains a `subGraphs` option | Modify |
| `packages/kit/src/graphql/builder.ts` | pass `subGraphNames` to `registerErrorTypes`; add `subGraphs` to relay `nodeTypeOptions`/`nodeQueryOptions`/`nodesQueryOptions` | Modify |
| `packages/kit/src/graphql/builder.test.ts` | kit regression: a tagged relay mutation (+ Input/Payload/Result/Success + shared error) builds & validates in a sub-graph, absent from another | Modify |
| `packages/modules/auth/src/graphql/schema/subgraphs.ts` | the `sg()` audience helper | Create |
| `packages/modules/auth/src/graphql/schema/subgraphs.test.ts` | unit test for `sg()` | Create |
| `packages/modules/auth/src/graphql/schema/user/{mutations,queries,types,errors}.ts` | tag the **admin** audience (user domain) | Modify |
| `packages/modules/auth/src/graphql/schema/impersonation/{mutations,errors}.ts` | tag **admin** (impersonation) | Modify |
| `packages/modules/auth/src/graphql/schema/organization/{mutations,queries,types,errors}.ts` | tag **org** management ops + **account** self-ops; `Invitation`/`Member` → `account+org` | Modify |
| `packages/modules/auth/src/graphql/schema/account/{mutations,errors}.ts` | tag the **account** audience (account domain) | Modify |
| `packages/modules/auth/src/graphql/schema/api-key/{mutations,queries,types,errors}.ts` | **split** api-key ops per audience (account/org), drop `ApiKeyOwnerInput`/`ApiKeyOwnerType`; `ApiKey` node + domain errors stay account+org | Modify |
| `packages/modules/auth/src/services/api-key.integration.test.ts` | update existing `createApiKey(owner:…)` calls to the split mutations | Modify |
| `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts` | per-audience presence/isolation/`node(id:)` E2E | Create |
| `apps/life/...` (the `buildApp` call) | serve `subGraphs: ['public','account','org','admin']` | Modify |

---

## Task 1: Kit enablement — shared errors + relay `node` into every served sub-graph

**Files:**
- Modify: `packages/kit/src/graphql/errors/builders.ts`
- Modify: `packages/kit/src/graphql/builder.ts`
- Test: `packages/kit/src/graphql/builder.test.ts`

**Context:** Under opt-in/default-none, a sub-graph mutation that lists a shared error (`ValidationError`, …) in `errors.types` fails to build unless that error type is a sub-graph member; and `node(id:)`/the `Node` interface are absent from a sub-graph unless the relay options tag them. Both are shared infra → tag into every served sub-graph (`subGraphNames`), exactly like the existing `pageInfoTypeOptions` and the shared scalars. `subGraphNames` is already a `setupBuilder` parameter.

- [ ] **Step 1: Write the failing kit regression test**

In `packages/kit/src/graphql/builder.test.ts`, append a new describe block. It registers a domain error + a relay mutation tagged into `public` (all 5 tag points) whose `errors.types` includes the shared `ValidationError`, builds the `public` sub-graph, and asserts the generated types are present + the schema validates; then builds `admin` and asserts they are absent. Use the file's existing `buildSchema(contributions, subGraph?)` helper and `itEffect`:

```ts
import { assertValidSchema } from 'graphql' // already imported in this file
import { Data } from 'effect'
import { registerError } from './errors/builders'
import { ValidationError } from './errors'

describe('makeGraphQLBuilder — relay mutation inside a sub-graph', () => {
  class ThingFailed extends Data.TaggedError('ThingFailed')<{ message: string }> {
    readonly code = 'THING_FAILED'
  }

  const withMutation = [
    (b: any) => {
      registerError(b, ThingFailed, { name: 'ThingFailed', subGraphs: ['public'] })
      b.relayMutationField(
        'doThing',
        { subGraphs: ['public'], inputFields: (t: any) => ({ name: t.string({ required: true }) }) },
        {
          subGraphs: ['public'],
          errors: {
            types: [ValidationError, ThingFailed],
            union: { subGraphs: ['public'] },
            result: { subGraphs: ['public'] },
          },
          resolve: () => ({ ok: true }),
        },
        { subGraphs: ['public'], outputFields: (t: any) => ({ ok: t.boolean({ resolve: (p: any) => p.ok }) }) },
      )
    },
  ]

  itEffect('public sub-graph contains the mutation + its Input/Payload/Result/Success + shared error, and validates', async () => {
    const schema = await buildSchema(withMutation, 'public')
    expect(() => assertValidSchema(schema)).not.toThrow()
    expect(schema.getMutationType()!.getFields().doThing).toBeDefined()
    expect(schema.getType('DoThingInput')).toBeDefined()
    expect(schema.getType('DoThingPayload')).toBeDefined()
    expect(schema.getType('DoThingResult')).toBeDefined()
    expect(schema.getType('DoThingSuccess')).toBeDefined()
    expect(schema.getType('ValidationError')).toBeDefined() // shared error tagged by registerErrorTypes
    expect(schema.getType('ThingFailed')).toBeDefined()
  })

  itEffect('admin sub-graph (mutation not tagged into it) omits the mutation and its generated types', async () => {
    const schema = await buildSchema(withMutation, 'admin')
    expect(schema.getMutationType()?.getFields().doThing).toBeUndefined()
    expect(schema.getType('DoThingPayload')).toBeUndefined()
  })

  itEffect('node(id:) query + Node interface are present in a served sub-graph', async () => {
    const schema = await buildSchema([], 'public')
    expect(schema.getType('Node')).toBeDefined()
    expect(schema.getQueryType()!.getFields().node).toBeDefined()
  })
})
```

> The generated type names follow Pothos relay conventions: `DoThingInput` (from the input options), `DoThingPayload` (payload options), and the errors plugin's `DoThingResult` (union) + `DoThingSuccess` (wrapper). If a name differs in this repo's config, introspect `schema.getTypeMap()` and adjust the assertion to the real name (the intent: field + all four generated types present in `public`, absent from `admin`).

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Expected: the new tests FAIL — `registerError` rejects the `subGraphs` option / `ValidationError` is not in the `public` sub-graph (build throws) / `Node` + `node` absent from `public`.

- [ ] **Step 3: Add `subGraphs` to `registerError`**

In `packages/kit/src/graphql/errors/builders.ts`, add `subGraphs` to `RegisterErrorOptions` (line ~22) and forward it:

```ts
export interface RegisterErrorOptions {
  name: string
  fields?: (t: any) => Record<string, any>
  subGraphs?: readonly string[]
}
```

In `registerError` (line ~113), forward it to `objectType`:

```ts
export function registerError(
  builder: AnyBuilder,
  ErrorClass: new (...args: any[]) => Error,
  opts: RegisterErrorOptions,
): void {
  builder.objectType(ErrorClass, {
    name: opts.name,
    interfaces: [getErrorInterface(builder)],
    fields: opts.fields ?? ((_t: any) => ({})),
    ...(opts.subGraphs ? { subGraphs: opts.subGraphs } : {}),
  })
}
```

- [ ] **Step 4: Tag the shared error types from `registerErrorTypes`**

In the same file, change `registerErrorTypes(builder)` (line ~31) to accept the served names and tag the `Error` interface, `FieldError`, and every shared error:

```ts
export function registerErrorTypes(builder: AnyBuilder, subGraphs: readonly string[] = []): void {
  const ErrorInterface = builder.interfaceRef('Error').implement({
    subGraphs,
    fields: (t: any) => ({
      message: t.exposeString('message'),
      code: t.string({ resolve: (e: any) => e.code }),
    }),
  })

  const FieldErrorObject = builder.objectRef('FieldError').implement({
    subGraphs,
    fields: (t: any) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder[ERROR_REFS] = { ErrorInterface, FieldErrorObject } satisfies ErrorRefs

  registerError(builder, ValidationError, {
    name: 'ValidationError', subGraphs,
    fields: (t: any) => ({ fields: t.field({ type: [FieldErrorObject], resolve: (e: any) => e.fields }) }),
  })
  registerError(builder, NotFoundError, {
    name: 'NotFoundError', subGraphs,
    fields: (t: any) => ({ resource: t.exposeString('resource'), id: t.id({ resolve: (e: any) => String(e.id) }) }),
  })
  registerError(builder, ConflictError, {
    name: 'ConflictError', subGraphs,
    fields: (t: any) => ({ resource: t.exposeString('resource'), conflictField: t.exposeString('conflictField') }),
  })
  registerError(builder, ForbiddenError, {
    name: 'ForbiddenError', subGraphs,
    fields: (t: any) => ({ requiredPermission: t.exposeString('requiredPermission') }),
  })
  registerError(builder, UnauthenticatedError, { name: 'UnauthenticatedError', subGraphs })
  registerError(builder, OptimisticLockError, {
    name: 'OptimisticLockError', subGraphs,
    fields: (t: any) => ({
      entityId: t.field({ type: 'ID', resolve: (e: any) => String(e.entityId) }),
      expectedVersion: t.exposeInt('expectedVersion'),
      actualVersion: t.int({ nullable: true, resolve: (e: any) => e.actualVersion }),
      code: t.string({ resolve: () => 'OPTIMISTIC_LOCK_ERROR' }),
    }),
  })
}
```

- [ ] **Step 5: Pass `subGraphNames` to `registerErrorTypes` + tag the relay `node` options**

In `packages/kit/src/graphql/builder.ts`: at the `registerErrorTypes(builder)` call site (line ~369), pass the names:

```ts
registerErrorTypes(builder, subGraphNames as SubGraphName[])
```

In the `relay: {...}` block (lines ~274-304), add `nodeTypeOptions` and add `subGraphs` to the two existing query-options objects (preserve their `resolve`):

```ts
    relay: {
      clientMutationId: 'omit',
      cursorType: 'String',
      pageInfoTypeOptions: { subGraphs: subGraphNames as SubGraphName[] },
      nodeTypeOptions: { subGraphs: subGraphNames as SubGraphName[] },
      nodeQueryOptions: {
        subGraphs: subGraphNames as SubGraphName[],
        resolve: async (_parent, { id }, ctx, _info, resolveNode) => { /* …unchanged… */ },
      },
      nodesQueryOptions: {
        subGraphs: subGraphNames as SubGraphName[],
        resolve: async (_parent, { ids }, ctx, _info, resolveNodes) => { /* …unchanged… */ },
      },
    },
```

> Keep the existing `resolve` bodies verbatim — only add the `subGraphs` key above each.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Expected: all builder tests PASS, including the 3 new ones and every pre-existing test.

- [ ] **Step 7: Type-check + lint**

Run: `cd packages/kit && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/builder.ts src/graphql/errors/builders.ts src/graphql/builder.test.ts`
Expected: no errors. (Run check-types and lint SEPARATELY; do NOT use `--fix` — it strips the `as SubGraphName[]` casts. See memory `reference_lintfix_strips_pothos_enum_cast`.)

- [ ] **Step 8: Rebuild kit dist (downstream auth E2E consumes it)**

Run: `pnpm --filter @czo/kit build`
Expected: completes. (`dist/**` is gitignored — not staged.)

- [ ] **Step 9: Stage**

```bash
git add packages/kit/src/graphql/builder.ts packages/kit/src/graphql/errors/builders.ts packages/kit/src/graphql/builder.test.ts
```

---

## Task 2: Auth `sg()` audience helper

**Files:**
- Create: `packages/modules/auth/src/graphql/schema/subgraphs.ts`
- Test: `packages/modules/auth/src/graphql/schema/subgraphs.test.ts`

**Context:** Each `relayMutationField` needs `subGraphs` at 5 places (field, input, payload, error union, error result). `sg()` expands one audience list into the four option objects so a registrar applies it uniformly, making the silent-drop footgun hard to hit.

- [ ] **Step 1: Write the failing test**

Create `packages/modules/auth/src/graphql/schema/subgraphs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sg } from './subgraphs'

describe('sg() audience helper', () => {
  it('expands one audience into the four relayMutationField option objects', () => {
    const A = sg('admin')
    expect(A.field).toEqual({ subGraphs: ['admin'] })
    expect(A.input).toEqual({ subGraphs: ['admin'] })
    expect(A.payload).toEqual({ subGraphs: ['admin'] })
    expect(A.errorOpts).toEqual({ union: { subGraphs: ['admin'] }, result: { subGraphs: ['admin'] } })
  })

  it('supports multi-membership', () => {
    expect(sg('account', 'org').field).toEqual({ subGraphs: ['account', 'org'] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/modules/auth && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: FAIL — module `./subgraphs` does not exist.

- [ ] **Step 3: Create the helper**

Create `packages/modules/auth/src/graphql/schema/subgraphs.ts`:

```ts
import type { SubGraphName } from '@czo/kit/graphql'

/**
 * Expand one audience (one or more sub-graph names) into the option fragments a
 * `relayMutationField` needs. Spread `field`/`input`/`payload` into the 3rd/2nd/4th
 * args and merge `errorOpts` into the field's `errors` option:
 *
 *   const A = sg('admin')
 *   builder.relayMutationField('x',
 *     { ...A.input, inputFields },
 *     { ...A.field, errors: { types: [...], ...A.errorOpts }, resolve },
 *     { ...A.payload, outputFields })
 */
export function sg(...names: SubGraphName[]) {
  const subGraphs = names
  return {
    field: { subGraphs },
    input: { subGraphs },
    payload: { subGraphs },
    errorOpts: { union: { subGraphs }, result: { subGraphs } },
  } as const
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/modules/auth && pnpm test src/graphql/schema/subgraphs.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/subgraphs.ts src/graphql/schema/subgraphs.test.ts`

```bash
git add packages/modules/auth/src/graphql/schema/subgraphs.ts packages/modules/auth/src/graphql/schema/subgraphs.test.ts
```

---

## Task 3: Tag the **admin** audience + establish the per-audience E2E

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/user/{mutations,queries,types,errors}.ts`
- Modify: `packages/modules/auth/src/graphql/schema/impersonation/{mutations,errors}.ts`
- Create: `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts`

**Context:** `admin` = global platform ops. Tag the 9 user mutations + 2 impersonation mutations + the `user`/`users` queries + the `User` node, `Session`, user inputs/enums, and the user/impersonation domain errors. This task also establishes the E2E harness that boots auth with all four audiences served and asserts presence/isolation per audience.

- [ ] **Step 1: Tag the user + impersonation mutations**

In `packages/modules/auth/src/graphql/schema/user/mutations.ts`, at the top of `registerUserMutations`, add `const A = sg('admin')` and apply it to ALL 9 mutations (`createUser`, `updateUser`, `removeUser`, `banUser`, `unbanUser`, `setRole`, `setUserPassword`, `revokeSession`, `revokeSessions`). For each, spread into the 4-arg form and merge `errorOpts` into `errors`:

```ts
import { sg } from '../subgraphs'

export function registerUserMutations(builder: AuthGraphQLSchemaBuilder): void {
  const A = sg('admin')
  builder.relayMutationField(
    'updateUser',
    { ...A.input, inputFields: t => ({ /* …unchanged… */ }) },
    {
      ...A.field,
      description: '…unchanged…',
      errors: { types: [/* …unchanged… */], ...A.errorOpts },
      resolve: /* …unchanged… */,
    },
    { ...A.payload, outputFields: t => ({ /* …unchanged… */ }) },
  )
  // …apply the identical 3-spread + errors-merge to the other 8 user mutations…
}
```

In `packages/modules/auth/src/graphql/schema/impersonation/mutations.ts`, do the same with `const A = sg('admin')` for `startImpersonation` and `stopImpersonation`.

> Some of these may use `builder.relayMutationField` with only 3 args (no payload options object) if they return a plain payload, or a 2-arg form. If a mutation lacks an explicit input/payload options object, ADD one carrying just the `subGraphs` (e.g. `{ ...A.payload, outputFields: … }`). The spike confirmed each generated type needs its own tag; verify in Step 6 that none of the 11 admin mutations is silently dropped.

- [ ] **Step 2: Tag the user queries + types + errors**

In `user/queries.ts`: add `subGraphs: ['admin']` to the `user` and `users` field options.
In `user/types.ts`: add `subGraphs: ['admin']` to the `.implement(...)` of the `users` drizzleNode (`User`) and the `Session` objectRef, and to the inputs/enums it declares (`UserCreateData`, `UserUpdateData`, `UserBanData`, `UserOrderByInput`, `UserOrderField`, `OrderDirection`, `ImpersonateUserInput`) on their `inputType(...)`/`enumType(...)` options.
In `user/errors.ts` and `impersonation/errors.ts`: pass `subGraphs: ['admin']` to each `registerError(...)` call.

> Input/enum/object types use a plain `subGraphs: ['admin']` on their own options object (NOT the `sg()` helper, which is shaped for the 4-arg mutation form).

- [ ] **Step 3: Write the per-audience E2E (admin assertions)**

Create `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts`. Inspect a sibling auth E2E (`ls packages/modules/auth/src/e2e/` and read one `*.e2e.test.ts`) for the exact boot helper. Boot the app with the three audiences SERVED by passing `subGraphs: ['public', 'account', 'org', 'admin']` to the harness's `buildApp`/`bootTestApp` options (if the harness doesn't expose it, extend the local harness to forward a `subGraphs` option to `buildApp`). Then:

```ts
// <imports + boot via the auth E2E harness, served with all four audiences>

const fieldNames = async (path: string, root: 'Query' | 'Mutation') => {
  const res = await app.fetch(new Request(`http://local${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: `query { __type(name: "${root}") { fields { name } } }` }),
  }))
  const body = await res.json()
  return (body.data?.__type?.fields ?? []).map((f: { name: string }) => f.name)
}

describe('GraphQL audience sub-graphs', () => {
  it('/graphql/admin exposes all admin operations (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/admin', 'Query')
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['user', 'users']) expect(q).toContain(f)
    for (const f of ['createUser','updateUser','removeUser','banUser','unbanUser','setRole','setUserPassword','revokeSession','revokeSessions','startImpersonation','stopImpersonation'])
      expect(m).toContain(f)
  })

  it('/graphql/admin omits account/org operations (isolation)', async () => {
    const m = await fieldNames('/graphql/admin', 'Mutation')
    for (const f of ['changePassword', 'createOrganization', 'createApiKey']) expect(m).not.toContain(f)
  })
})
```

- [ ] **Step 4: Rebuild kit dist (if Task 1 not rebuilt since) + run the E2E**

Run: `pnpm --filter @czo/kit build` (only needed if kit changed since the last build)
Run: `cd packages/modules/auth && pnpm test src/e2e/subgraph-audiences.e2e.test.ts`
Expected: both admin tests PASS. If an admin mutation is MISSING from the presence list, it was under-tagged (silent drop) — re-check its 5 tag points. If the schema build throws naming a type, that type needs a `subGraphs: ['admin']` tag (a user input/enum/error) — add it.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/user src/graphql/schema/impersonation src/e2e/subgraph-audiences.e2e.test.ts`

```bash
git add packages/modules/auth/src/graphql/schema/user \
        packages/modules/auth/src/graphql/schema/impersonation \
        packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts
```

---

## Task 4: Tag the **org** audience

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/organization/{mutations,queries,types,errors}.ts`
- Modify: `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts`

**Context:** `org` = org back-office management. Tag the 7 management mutations (`createOrganization`, `updateOrganization`, `deleteOrganization`, `inviteMember`, `removeMember`, `updateMemberRole`, `cancelInvitation`), the queries (`organization`, `organizations`, `members`, `checkSlug`, `invitation`, `invitations`, `organizationApiKeys`), the `Organization` node + org inputs, and org domain errors. The `Member`/`Invitation` nodes are tagged `org` here and gain `account` in Task 5 (multi-membership). **Leave `acceptInvitation`/`rejectInvitation`/`leaveOrganization`/`setActiveOrganization` UNTAGGED here — they are `account` (Task 5).**

- [ ] **Step 1: Tag the org management mutations**

In `organization/mutations.ts`, add `const O = sg('org')` and apply it to the 7 management mutations ONLY (not the 4 self-ops). Same 3-spread + `errors` merge as Task 3.

- [ ] **Step 2: Tag the org queries + types + errors**

In `organization/queries.ts`: add `subGraphs: ['org']` to `organization`, `organizations`, `members`, `checkSlug`, `invitation`, `invitations`, `organizationApiKeys`.

> `organizationApiKeys` returns `ApiKey` (tagged `account+org` in Task 6) — fine, `org` ⊇ this query's `org` membership.

In `organization/types.ts`: add `subGraphs: ['org']` to the `Organization` (`organizations` drizzleNode) `.implement(...)`, and to org inputs (`OrganizationCreateData`, `OrganizationUpdateData`, `OrganizationInvitationData`). For the `Member` (`members`) and `Invitation` (`invitations`) drizzleNodes, tag `subGraphs: ['org']` now (Task 5 changes these to `['account', 'org']`).
In `organization/errors.ts`: pass `subGraphs: ['org']` to each `registerError(...)` call.

- [ ] **Step 3: Extend the E2E with org assertions**

Append to `subgraph-audiences.e2e.test.ts`:

```ts
  it('/graphql/org exposes org management ops + queries (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/org', 'Query')
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['organization','organizations','members','checkSlug','invitation','invitations','organizationApiKeys'])
      expect(q).toContain(f)
    for (const f of ['createOrganization','updateOrganization','deleteOrganization','inviteMember','removeMember','updateMemberRole','cancelInvitation'])
      expect(m).toContain(f)
  })

  it('/graphql/org omits the account self-ops and admin ops (isolation)', async () => {
    const m = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['acceptInvitation','leaveOrganization','setActiveOrganization','createUser']) expect(m).not.toContain(f)
  })
```

- [ ] **Step 4: Rebuild (if needed) + run**

Run: `cd packages/modules/auth && pnpm test src/e2e/subgraph-audiences.e2e.test.ts`
Expected: admin + org tests PASS. Missing op → under-tagged; build throw naming a type → tag that org input/error.

- [ ] **Step 5: Type-check + lint + stage**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/organization src/e2e/subgraph-audiences.e2e.test.ts`

```bash
git add packages/modules/auth/src/graphql/schema/organization packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts
```

---

## Task 5: Tag the **account** audience (incl. org self-ops + multi-membership)

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/account/{mutations,errors}.ts`
- Modify: `packages/modules/auth/src/graphql/schema/organization/{mutations,types}.ts`
- Modify: `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts`

**Context:** `account` = the logged-in user's own data + recovery. Tag the 9 account-domain mutations, plus the 4 self-ops that live in the organization domain (`acceptInvitation`, `rejectInvitation`, `leaveOrganization`, `setActiveOrganization`), plus the `myApiKeys`/`myInvitations` queries (note: `myApiKeys` lives in the api-key domain → tagged in Task 6; `myInvitations` lives in organization → tag here). Because `acceptInvitation` returns a Payload exposing `invitation: Invitation` AND `member: Member`, and `rejectInvitation` exposes `invitation: Invitation`, the `Invitation` and `Member` nodes must become `account + org` (multi-membership).

- [ ] **Step 1: Tag the account-domain mutations**

In `account/mutations.ts`, add `const ACC = sg('account')` and apply it to all 9 (`changePassword`, `requestPasswordReset`, `resetPassword`, `requestEmailVerification`, `verifyEmail`, `requestEmailChange`, `confirmEmailChange`, `deleteAccount`, `restoreAccount`). In `account/errors.ts`: `subGraphs: ['account']` on each `registerError(...)`.

- [ ] **Step 2: Tag the org-domain self-ops as account**

In `organization/mutations.ts`, add `const ACC = sg('account')` and apply it to `acceptInvitation`, `rejectInvitation`, `leaveOrganization`, `setActiveOrganization` (these were left untagged in Task 4). For `myInvitations` in `organization/queries.ts`: add `subGraphs: ['account']`.

> Any error type listed in these 4 mutations' `errors.types` that is an org-domain error already tagged `['org']` must ALSO be tagged `account` (multi-membership) — pass `subGraphs: ['account', 'org']` to that error's `registerError(...)`. The Step 4 build will throw naming any error missing from `account`; widen its membership.

- [ ] **Step 3: Widen `Invitation` + `Member` to account+org**

In `organization/types.ts`, change the `Member` (`members`) and `Invitation` (`invitations`) drizzleNode `.implement(...)` `subGraphs` from `['org']` to `['account', 'org']`.

- [ ] **Step 4: Extend the E2E with account assertions**

Append:

```ts
  it('/graphql/account exposes account mutations + self org-ops + myInvitations (silent-drop guard)', async () => {
    const q = await fieldNames('/graphql/account', 'Query')
    const m = await fieldNames('/graphql/account', 'Mutation')
    expect(q).toContain('myInvitations')
    for (const f of ['changePassword','requestPasswordReset','resetPassword','requestEmailVerification','verifyEmail','requestEmailChange','confirmEmailChange','deleteAccount','restoreAccount','acceptInvitation','rejectInvitation','leaveOrganization','setActiveOrganization'])
      expect(m).toContain(f)
  })

  it('/graphql/account omits org-management + admin ops (isolation)', async () => {
    const m = await fieldNames('/graphql/account', 'Mutation')
    for (const f of ['inviteMember','createOrganization','createUser','banUser']) expect(m).not.toContain(f)
  })
```

- [ ] **Step 5: Rebuild (if needed) + run**

Run: `cd packages/modules/auth && pnpm test src/e2e/subgraph-audiences.e2e.test.ts`
Expected: admin + org + account tests PASS. A build throw naming an org error referenced by a self-op → widen that error to `['account','org']` (Step 2 note).

- [ ] **Step 6: Type-check + lint + stage**

Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/account src/graphql/schema/organization src/e2e/subgraph-audiences.e2e.test.ts`

```bash
git add packages/modules/auth/src/graphql/schema/account \
        packages/modules/auth/src/graphql/schema/organization \
        packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts
```

---

## Task 6: Split the **api-key** surface per audience (account / org)

**Files:**
- Modify: `packages/modules/auth/src/graphql/schema/api-key/{mutations,queries,types,errors}.ts`
- Modify: `packages/modules/auth/src/services/api-key.integration.test.ts` (existing test calls `createApiKey` with `owner` — update to the split mutations)
- Modify: `packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts`

**Context:** Instead of one `createApiKey` carrying an `ApiKeyOwnerInput` USER/ORG discriminator validated at runtime, **fully partition** the api-key surface: every op gets an `account` variant (personal key; owner = the session user; no `owner` input) and an `org` variant (`organizationId`-scoped). This pushes the discriminator into the schema (two named mutations) and gives each audience a targeted input. The `ApiKeyService.{create,update,remove}` signatures are UNCHANGED — only the resolvers split, fixing `ownerType`/`ownerId` per variant. Delete `ApiKeyOwnerInput` + `ApiKeyOwnerType`. The `ApiKey` node + api-key domain errors stay `account+org` (one entity / one error). `organizationApiKeys` (org) was tagged in Task 4.

> Read `api-key/mutations.ts`, `api-key/queries.ts`, `api-key/types.ts`, `graphql/scopes.ts` (the `apiKeyOwner` scope shape), and `services/api-key.integration.test.ts` before editing. The original `createApiKey` input is `{ owner, name, group, prefix, expiresIn, remaining, refillAmount, refillInterval, rateLimitEnabled, rateLimitTimeWindow, rateLimitMax }`; the resolver derives `reference: 'user'|'organization'` + `referenceId` from `owner` and calls `svc.create(rest, { reference })`. Reuse those exact key fields + coercions in BOTH split variants — only the owner source differs.

- [ ] **Step 1: Account `createApiKey` (owner = session user, no `owner` input)**

In `api-key/mutations.ts`, add `import { sg } from '../subgraphs'`, `const ACC = sg('account')`, `const ORG = sg('org')` at the top of the registrar. Replace the single `createApiKey` with the account variant — same key fields as the original MINUS `owner`, owner forced to the session user:

```ts
  builder.relayMutationField(
    'createApiKey',
    { ...ACC.input, inputFields: t => ({
        name: t.string({ required: true, description: 'Human-readable label for the new key.' }),
        group: t.string({ required: true, description: 'Group the key belongs to.' }),
        prefix: t.string({ required: true, description: 'Non-secret prefix to prepend to the generated key.' }),
        expiresIn: t.int({ required: false, description: 'Lifetime in seconds; omit for a key that never expires.' }),
        remaining: t.int({ required: false, description: 'Initial request budget; omit for unlimited.' }),
        refillAmount: t.int({ required: false, description: 'Requests added to the budget at each refill.' }),
        refillInterval: t.int({ required: false, description: 'Interval in ms between automatic refills.' }),
        rateLimitEnabled: t.boolean({ required: false, description: 'Whether to enforce request rate limiting.' }),
        rateLimitTimeWindow: t.int({ required: false, description: 'Rate-limit window length in ms.' }),
        rateLimitMax: t.int({ required: false, description: 'Max requests per rate-limit window.' }),
      }) },
    {
      ...ACC.field,
      description: 'Creates a personal API key owned by the current user and returns the one-time plaintext secret.',
      errors: { types: [ValidationError, UnauthenticatedError, RefillPairRequired], ...ACC.errorOpts },
      authScopes: (_parent, _args, ctx) => ({
        apiKeyOwner: { ownerType: 'USER' as const, ownerId: Number(ctx.auth!.user!.id), action: 'create' as const },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { apiKey, plain } = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* ApiKeyService
          return yield* svc.create({
            ...input,
            referenceId: Number(ctx.auth!.user!.id),
            refillAmount: input.refillAmount ?? undefined,
            refillInterval: input.refillInterval ?? undefined,
            rateLimitEnabled: input.rateLimitEnabled ?? undefined,
            rateLimitTimeWindow: input.rateLimitTimeWindow ?? undefined,
            rateLimitMax: input.rateLimitMax ?? undefined,
          }, { reference: 'user' })
        }))
        return { apiKey, plain }
      },
    },
    { ...ACC.payload, outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The newly created key, with its safe metadata.' }),
        plain: t.string({ nullable: true, resolve: p => p.plain, description: 'The plaintext secret — shown only ONCE, here at creation.' }),
      }) },
  )
```

- [ ] **Step 2: Org `createOrganizationApiKey` (owner = `organizationId`)**

Add directly after, identical key fields but with an `organizationId` input instead of session owner, `org` audience, and the org-permission authScope:

```ts
  builder.relayMutationField(
    'createOrganizationApiKey',
    { ...ORG.input, inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Organization that will own the new key.' }),
        name: t.string({ required: true, description: 'Human-readable label for the new key.' }),
        group: t.string({ required: true, description: 'Group the key belongs to.' }),
        prefix: t.string({ required: true, description: 'Non-secret prefix to prepend to the generated key.' }),
        expiresIn: t.int({ required: false }),
        remaining: t.int({ required: false }),
        refillAmount: t.int({ required: false }),
        refillInterval: t.int({ required: false }),
        rateLimitEnabled: t.boolean({ required: false }),
        rateLimitTimeWindow: t.int({ required: false }),
        rateLimitMax: t.int({ required: false }),
      }) },
    {
      ...ORG.field,
      description: 'Creates an organization-owned API key and returns the one-time plaintext secret.',
      errors: { types: [ValidationError, UnauthenticatedError, RefillPairRequired], ...ORG.errorOpts },
      authScopes: (_parent, args, _ctx) => ({
        apiKeyOwner: { ownerType: 'ORGANIZATION' as const, ownerId: Number(args.input.organizationId.id), action: 'create' as const },
      }),
      resolve: async (_root, { input }, ctx) => {
        const { organizationId, ...rest } = input
        const { apiKey, plain } = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* ApiKeyService
          return yield* svc.create({
            ...rest,
            referenceId: Number(organizationId.id),
            refillAmount: rest.refillAmount ?? undefined,
            refillInterval: rest.refillInterval ?? undefined,
            rateLimitEnabled: rest.rateLimitEnabled ?? undefined,
            rateLimitTimeWindow: rest.rateLimitTimeWindow ?? undefined,
            rateLimitMax: rest.rateLimitMax ?? undefined,
          }, { reference: 'organization' })
        }))
        return { apiKey, plain }
      },
    },
    { ...ORG.payload, outputFields: t => ({
        apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey, description: 'The newly created key, with its safe metadata.' }),
        plain: t.string({ nullable: true, resolve: p => p.plain, description: 'The plaintext secret — shown only ONCE, here at creation.' }),
      }) },
  )
```

> Confirm the `apiKeyOwner` authScope accepts the `{ ownerType, ownerId, action }` shape (it did for the original create). The account variant authorizes via the session user as owner; if `scopes.ts` shows a simpler equivalent (e.g. the scope already resolves "self"), keep the `{ ownerType:'USER', ownerId: session }` form for parity.

- [ ] **Step 3: Split `updateApiKey` and `removeApiKey` (id-based; identical input per pair, audience differs)**

The id-based ops don't branch on a creation discriminator, so each variant is the original body with the audience helper spread + a renamed org variant. Keep `updateApiKey` (account) and add `updateOrganizationApiKey` (org) with the SAME `inputFields` (`{ id, name, enabled, remaining, expiresIn, refill*, rateLimit* }`), `errors.types` (`[ValidationError, UnauthenticatedError, ApiKeyNotFound, NoChanges, RefillPairRequired]`), `authScopes: { apiKeyOwner: { keyId: Number(args.input.id.id), action: 'update' } }`, and `resolve` (`svc.update(keyId, patch)`) — only `...ACC.*` vs `...ORG.*` and the field name differ. Do the same for `removeApiKey` (account) + `removeOrganizationApiKey` (org) (input `{ id }`, the original remove errors/authScope/resolve, `action: 'delete'`).

```ts
  // account update — spread ACC into the EXISTING updateApiKey 4-arg form:
  builder.relayMutationField('updateApiKey',
    { ...ACC.input, inputFields: t => ({ /* …the original updateApiKey fields… */ }) },
    { ...ACC.field, description: '…', errors: { types: [/* …original… */], ...ACC.errorOpts }, authScopes: /* …original… */, resolve: /* …original… */ },
    { ...ACC.payload, outputFields: t => ({ apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey }) }) })

  // org update — same body, ORG helper + renamed:
  builder.relayMutationField('updateOrganizationApiKey',
    { ...ORG.input, inputFields: t => ({ /* …identical fields… */ }) },
    { ...ORG.field, description: '…', errors: { types: [/* …identical… */], ...ORG.errorOpts }, authScopes: /* …identical… */, resolve: /* …identical… */ },
    { ...ORG.payload, outputFields: t => ({ apiKey: t.field({ type: 'ApiKey', resolve: p => p.apiKey }) }) })
  // …repeat the pair for removeApiKey (ACC) + removeOrganizationApiKey (ORG).
```

- [ ] **Step 4: Split the `apiKey(id)` query; tag `myApiKeys`**

In `api-key/queries.ts`: keep `apiKey` (account lookup) with `subGraphs: ['account']`; add `organizationApiKey` (org lookup) — same `{ id }` arg + resolver, `subGraphs: ['org']`. Add `subGraphs: ['account']` to `myApiKeys`. (`organizationApiKeys` already `['org']` from Task 4.)

- [ ] **Step 5: Tag the shared types/errors; delete the owner input + enum**

In `api-key/types.ts`: `subGraphs: ['account', 'org']` on the `ApiKey` (`apikeys`) drizzleNode `.implement(...)`. DELETE the `ApiKeyOwnerInput` `inputType(...)` and `ApiKeyOwnerType` `enumType(...)` declarations. First `grep -rn "ApiKeyOwnerInput\|ApiKeyOwnerType" packages/modules/auth/src` to confirm nothing else references them (only the old `createApiKey` did); if anything else does, leave them and report.
In `api-key/errors.ts`: `subGraphs: ['account', 'org']` on each `registerError(...)` (e.g. `RefillPairRequired`, `ApiKeyNotFound`, `NoChanges`).

- [ ] **Step 6: Update the existing api-key integration test**

In `packages/modules/auth/src/services/api-key.integration.test.ts` (and any other test/E2E that calls `createApiKey` with `owner`), replace `createApiKey(input: { owner: { type: USER, id }, … })` with the account `createApiKey(input: { … })` (no owner) for personal keys, and `createOrganizationApiKey(input: { organizationId, … })` for org keys. Run `grep -rn "createApiKey\|ApiKeyOwnerInput\|owner:" packages/modules/auth/src` to find every call site.

- [ ] **Step 7: Extend the audience E2E with the split names**

Append to `subgraph-audiences.e2e.test.ts`:

```ts
  it('api-key ops are split per audience (account personal vs org)', async () => {
    const accM = await fieldNames('/graphql/account', 'Mutation')
    const orgM = await fieldNames('/graphql/org', 'Mutation')
    for (const f of ['createApiKey','updateApiKey','removeApiKey']) { expect(accM).toContain(f); expect(orgM).not.toContain(f) }
    for (const f of ['createOrganizationApiKey','updateOrganizationApiKey','removeOrganizationApiKey']) { expect(orgM).toContain(f); expect(accM).not.toContain(f) }
    expect(await fieldNames('/graphql/account', 'Query')).toEqual(expect.arrayContaining(['myApiKeys','apiKey']))
    expect(await fieldNames('/graphql/org', 'Query')).toEqual(expect.arrayContaining(['organizationApiKeys','organizationApiKey']))
  })

  it('ApiKeyOwnerInput / ApiKeyOwnerType are gone from every served schema', async () => {
    for (const a of ['account','org','admin']) {
      const res = await app.fetch(new Request(`http://local/graphql/${a}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: `query { __type(name: "ApiKeyOwnerInput") { name } }` }),
      }))
      expect((await res.json()).data.__type).toBeNull()
    }
  })

  it('node(id:) is present per audience', async () => {
    for (const a of ['account', 'org', 'admin']) expect(await fieldNames(`/graphql/${a}`, 'Query')).toContain('node')
  })
```

- [ ] **Step 8: Rebuild (if needed) + run + type-check + lint**

Run: `cd packages/modules/auth && pnpm test src/e2e/subgraph-audiences.e2e.test.ts src/services/api-key.integration.test.ts`
Run: `cd packages/modules/auth && pnpm check-types && pnpm lint --max-warnings 0 src/graphql/schema/api-key src/e2e/subgraph-audiences.e2e.test.ts src/services/api-key.integration.test.ts`
Expected: all PASS; check-types + lint clean. A build throw naming `ApiKeyOwnerInput` means a lingering reference — finish removing it.

- [ ] **Step 9: Stage**

```bash
git add packages/modules/auth/src/graphql/schema/api-key \
        packages/modules/auth/src/services/api-key.integration.test.ts \
        packages/modules/auth/src/e2e/subgraph-audiences.e2e.test.ts
```

---

## Task 7: Serve `/graphql/{account,org,admin}` in `apps/life`

**Files:**
- Modify: the `apps/life` `buildApp(...)` call (locate with `grep -rn "buildApp(" apps/life`)

**Context:** The foundation defaults `buildApp` to serve `['public']`. Extend the served set so the three new audiences mount as real endpoints in the running app (the E2E already serves them in-process via its own boot; this is the production wiring).

- [ ] **Step 1: Add the served set**

In the `apps/life` `buildApp({...})` options object, add (preserving the existing options):

```ts
    subGraphs: ['public', 'account', 'org', 'admin'],
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter life check-types`
Expected: clean (`SubGraphName` resolves to the 4 names where auth is in the compilation).

- [ ] **Step 3: Lint + stage**

Run: `pnpm --filter life lint --max-warnings 0 <the edited file>`

```bash
git add <the apps/life file you edited>
```

---

## Task 8: Full validation + final review

**Files:** none (verification only)

- [ ] **Step 1: Rebuild kit + type-check the touched packages**

Run: `pnpm --filter @czo/kit build`
Run: `pnpm --filter @czo/kit --filter @czo/auth check-types`
Run: `pnpm --filter life check-types`
Expected: all clean (no NEW errors vs baseline).

- [ ] **Step 2: Run the affected suites**

Run: `cd packages/kit && pnpm test src/graphql/builder.test.ts`
Run: `cd packages/modules/auth && pnpm test src/graphql/schema/subgraphs.test.ts src/e2e/subgraph-audiences.e2e.test.ts`
Expected: green. (Auth `user.e2e` 57P01 pg-teardown flake is unrelated — re-run if a different suite shows it; see memory `project_module_merge_train`.)

- [ ] **Step 3: Lint the touched set**

Run: `pnpm --filter @czo/kit --filter @czo/auth lint --max-warnings 0`
Expected: clean. If `lint:fix` ever stripped a `subGraphs`/cast, restore by hand and re-run `check-types`.

- [ ] **Step 4: Review the staged diff**

Run: `git diff --cached --stat`
Expected: only kit (builder + errors + builder.test), auth (subgraphs helper + 5 domains + e2e), and the apps/life file. No `console.log`, no `as any` where inference suffices, no `dist/` staged, no commit.

- [ ] **Step 5: STOP — hand to the user**

Do NOT commit. Report: validation commands + results, the staged file list, and confirm every audience's operations are present (silent-drop guard) and isolated. The user reviews, then explicitly asks for the commit (and whether it joins PR #130 or a new branch).

---

## Self-review (against the spec)

- **Spec §Architecture 1 (kit enablement):** Task 1 — `registerErrorTypes(builder, subGraphNames)` tags shared errors + `Error`/`FieldError`; `registerError` gains `subGraphs`; relay `nodeTypeOptions`/`nodeQueryOptions`/`nodesQueryOptions` get `subGraphs`. ✓
- **Spec §Architecture 2 (audience mapping):** admin (Task 3), org (Task 4), account incl. self-ops + `Invitation`/`Member` multi-membership (Task 5), api-key **split per audience** (Task 6 — `createApiKey`/`createOrganizationApiKey`, etc.; drops `ApiKeyOwnerInput`/`ApiKeyOwnerType`). All 13 queries + 37 mutations covered across Tasks 3-6. ✓
- **Spec §Decision 7 (api-key split):** Task 6 — every api-key op partitioned into account/org variants with targeted inputs; `ApiKeyService` signatures unchanged; existing api-key integration test updated. ✓
- **Spec §Architecture 3 (sg helper):** Task 2. ✓
- **Spec §Architecture 4 (node per audience):** Task 1 (relay config) + Task 6 Step 3 (E2E node presence). ✓
- **Spec §Architecture 5 (serving):** Task 7. ✓
- **Spec §Testing:** kit regression (Task 1), per-audience presence/isolation E2E (Tasks 3-6), `node(id:)` (Task 6). The silent-drop guard = the presence assertions. ✓
- **Spike recipe (5 tag points):** encoded in the `sg()` helper (Task 2) + applied in Tasks 3-6. ✓
- **Placeholder scan:** the per-mutation edits in Tasks 3-6 show the full pattern on one mutation + the explicit enumerated list to apply it to (the bodies are read from the files; the edit is the mechanical 3-spread + errors-merge). The "find the exact type by build error" guidance is deliberate where the precise error/input set is discovered at build time.
- **Type consistency:** `sg()` shape (`field`/`input`/`payload`/`errorOpts{union,result}`) consistent across Task 2 definition and Tasks 3-6 usage; `subGraphs` option name consistent across kit (`registerError`, relay) and auth.
