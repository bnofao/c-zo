# GraphQL sub-graph architecture (foundation) — Design

**Date:** 2026-06-10
**Context:** Surfaced while designing B19 (B) (storefront product reads). Rather than gate a single monolithic schema with field-level authz alone, partition the GraphQL surface into **audience sub-graphs** using `@pothos/plugin-sub-graph`, so each audience's endpoint only *contains* the fields it should see. Authz (scopes) stays — sub-graphs control *exposure*, not *authorization*. **B19 (B) becomes the first consumer** (`channelProducts` lands in the `public` sub-graph).

This spec is the **foundation**: the plugin wiring, the sub-graph set, the membership policy, multi-schema serving, and a minimal `public` starter set to prove it. **Exhaustive tagging of every field is explicitly out of scope** and proceeds incrementally per module.

## Goal

Let the platform serve distinct, audience-scoped GraphQL schemas from the single shared builder — so a consumer (storefront, end-user app, org dashboard, platform console) reaches an endpoint whose schema *omits* everything outside its audience. A field is invisible to an audience unless explicitly tagged into it (opt-in, safe-by-default — nothing leaks into `public` by omission).

## The sub-graph set (by audience / auth principal)

| Sub-graph | Audience | Auth principal | Examples |
| --- | --- | --- | --- |
| `public` | storefront / anonymous shopper (via the front's BFF) | API key (`channel:read`) / none | `channelProducts`, published product fields, `resolvePrice`, display locales |
| `account` | a logged-in end-user, their own data | any session user | `me`, change password/email, my organizations, accept/reject invitation, my API keys |
| `org` | an organization's back-office | session + **org** member role | manage the org's catalog / inventory / channels / prices / translations / members / invitations / API keys |
| `admin` | platform operator | session + **global** role | global products/types/categories, locale CRUD, global users/roles, impersonation |

A field MAY belong to several sub-graphs (the plugin supports multi-membership); the set is an audience tagging, not a strict hierarchy. Example: a dual-authz `createProduct` (global vs org via input) is tagged `['org', 'admin']`; `resolvePrice` is `['public', 'org']`.

## Decisions (settled during brainstorming)

1. **Plugin:** `@pothos/plugin-sub-graph` on the shared kit builder.
2. **Set:** `public`, `account`, `org`, `admin` (above).
3. **Membership policy: opt-in, default = none.** An untagged field belongs to **no named sub-graph** — it appears only in the internal "full" schema, served nowhere public. To expose a field, tag it (`subGraphs: ['public']`). Impossible to leak into `public` by forgetting to gate. Tagging is applied at the **registrar/module level** where practical to keep the burden down.
4. **Serving: one endpoint per served sub-graph** — `/graphql/public`, `/graphql/account`, `/graphql/org`, `/graphql/admin`. The kit builds a filtered schema per name and mounts a Yoga instance per endpoint; the auth context contributor and the rate-limit/CJS transformers run on each. During the transition the existing full `/graphql` stays mounted for the dashboard (session-gated) until `account`/`org`/`admin` are fully tagged.
5. **Authz unchanged:** every field keeps its `authScopes`. A field in `public` (e.g. `channelProducts`) still gates on `channel:read`. Sub-graphs are exposure, not authorization.

## Architecture

### 1. Kit builder — `packages/kit/src/graphql/builder.ts`

Validated by a composition spike (`@pothos/plugin-sub-graph@4.4.0` with relay + scope-auth). The exact recipe:

- Add `SubGraphPlugin` to the `plugins` array. Add `SubGraphs: SubGraphName` to the builder's `SchemaTypes`.
- **Names are domain-owned, not kit-owned** (mirrors how auth already augments `BuilderAuthScopes` / `BuilderSchemaObjects`). Kit seeds only the platform baseline `public`; **auth** contributes `account`/`org`/`admin` because those map to the auth principal (session ⇒ `account`, org member ⇒ `org`, global role ⇒ `admin`):
  ```ts
  // @czo/kit/graphql (builder.ts) — kit owns only `public`
  export interface BuilderSubGraphs { public: true }
  export type SubGraphName = keyof BuilderSubGraphs

  // @czo/auth/graphql/index.ts — auth augments the rest
  declare module '@czo/kit/graphql' {
    interface BuilderSubGraphs { account: true; org: true; admin: true }
  }
  ```
  `public` is the only name kit ships so that **non-auth** modules (price, translation) can tag `['public']` without an auth dependency. A non-auth module that later tags into `org`/`admin` must have auth's augmentation visible in its compilation (follow-up; the starter set only uses `public`).
- Builder config — **opt-in, object fields inherit their type**:
  ```ts
  subGraphs: { defaultForTypes: [], fieldsInheritFromTypes: true }
  ```
  So a type is in a sub-graph only if tagged; an object type's fields **inherit** the type's sub-graphs (no per-field tagging).
- **Root types** present in every *known* sub-graph, but operations opt-in: `builder.queryType({ subGraphs: subGraphNames, defaultSubGraphsForFields: [] })` (and `mutationType`). `subGraphNames` is the **runtime list threaded from `buildApp`** (= the served list, `options.subGraphs ?? ['public']`) — NOT hardcoded. The names you serve are exactly the names whose roots are tagged and that `buildSchema(name)` can emit.
- **Object types**: tagged with `subGraphs: [...]` once; their fields inherit.
- **Relay connection fields**: tag the field AND the generated types — `t.connection(fieldOpts, connectionTypeOpts, edgeTypeOpts)` each carrying `subGraphs: [...]`.
- **Shared `PageInfo`**: `relay: { …, pageInfoTypeOptions: { subGraphs: subGraphNames } }` (one shared type, in every known sub-graph).
- **Invariant** (spike-confirmed): an operation/type with no `subGraphs` tag is in none of the named sub-graphs (full schema only).

- Give `buildSchema` an optional `subGraph` parameter (one method, DRY): `buildSchema()` = the full schema (kept for the transition + dev/introspection); `buildSchema(name)` = `builder.toSchema({ subGraph: name })`. `makeGraphQLBuilder` also takes the `subGraphNames` runtime list (default `['public']`) for the root + `PageInfo` tagging above.
- Export `SubGraphName` (the `keyof BuilderSubGraphs` alias) + the `BuilderSubGraphs` interface from `@czo/kit/graphql` so modules tag with a typed value and auth can augment.

### 2. Kit app serving — `packages/kit/src/module/app.ts`

- After building each served sub-graph schema, apply the same rate-limit directive transformer (and the CJS realm transformer) that the current single schema gets, then create a Yoga instance per endpoint and mount it at `/graphql/<name>` (the auth `contexts` contributor, node-guards, and error handling are identical across endpoints — reuse the existing wiring per schema).
- Configurable which sub-graphs are served (start with `public`; add the others as they are tagged). The full `/graphql` mount stays until retired.

### 3. Tagging API (how modules opt fields in)

Modules add the Pothos field option `subGraphs: [...]` (typed via `SubGraphName`) to the fields/queries/mutations they expose to an audience — e.g. on a query field, on object-type fields. No central registry; the tag lives at the field definition (co-located with the resolver + authScope). Where a whole registrar's fields share an audience, a small local helper can apply the tag uniformly.

### 4. `public` starter set (proof + B19 hook)

Tag a minimal, already-safe set into `public` to prove the endpoint serves a correct filtered schema and that relay/drizzle plumbing survives sub-graphing:
- `resolvePrice` / `resolvePrices` (already public + org-scoped in the service) → `public`.
- the `locales` / `defaultLocale` reads (public registry) → `public`.
- the object types they return (`CalculatedPrice` union + members, `Locale`) get the membership needed for those fields (per the plugin's type-inclusion rules).

`channelProducts` (B19 B) is tagged `public` when that feature lands — its plan is updated to do so.

## Data flow

```
storefront BFF → POST /graphql/public  (x-api-key)
  → Yoga(public schema) — schema CONTAINS only public-tagged fields
  → auth context contributor resolves the key → ctx.auth.apiKey
  → channelProducts authScope (channel:read) runs as usual
org dashboard → POST /graphql/org (session) → Yoga(org schema) — admin/global fields ABSENT
```

## Risks / validation

- **Plugin composition with relay + scope-auth — VALIDATED** by the spike: builds, introspects, and the recipe above (tag field + connection-type + edge-type, `pageInfoTypeOptions` for the shared `PageInfo`) yields a complete, valid `public` schema; an untagged field is correctly absent.
- **Drizzle `drizzleConnection` / `drizzleNode` — TO VALIDATE in integration** (needs the real DB-backed builder). The drizzle plugin's connection is built on relay's machinery, so the same field+connection+edge tagging is expected to apply, but `drizzleConnection` / `drizzleNode` must be confirmed to accept the connection/edge type options (or an equivalent). This is the first implementation task (an integration check on the real kit builder).
- **`node(id:)` / `nodes` + the kit node-guard registry — TO VALIDATE:** the relay `Node` interface + `node` query must resolve per-sub-graph (a `public` schema's `node` only sees types in `public`). The `Node` interface needs membership in every served sub-graph (like `PageInfo`).
- **Errors plugin payload/union types — TO VALIDATE:** mutation payload + error union types are generated like connections; they'll need the same field+generated-type tagging when mutations are placed in `account`/`org`/`admin` (not needed for the `public` starter set, which is read-only).
- **Validation realm / CJS transformer + rate-limit directive** must apply per sub-graph schema (the existing single-realm constraint — see `app.ts` comments — repeats per schema).

## Testing

- **Builder unit:** `buildSubGraphSchema('public')` produces a schema whose query type has the public-tagged fields and **omits** an untagged field; `buildSchema()` (full) still has everything. Same for another name.
- **Opt-in invariant:** a field with no `subGraphs` tag is absent from every named sub-graph schema (present only in full).
- **E2E:** a request to `/graphql/public` can run `resolvePrice` but a query referencing an untagged admin field fails schema validation (unknown field) — proving exposure isolation, not just authz.
- **Composition:** the `public` schema with a relay connection field builds + an introspection query returns its `Connection`/`PageInfo` types.

## Discovered during implementation (handled)

- **Argument types need sub-graph membership too, not just return types.** A `public` field whose *argument* is a custom scalar (`DateTime`) or input object (`PriceContextRuleInput`) makes the whole `public` schema un-buildable under opt-in/default-none. Fix: kit tags its 5 shared scalars (`DateTime`/`JSONObject`/`JSON`/`Date`/`Time`) into every known sub-graph (same treatment as the relay `PageInfo`); modules tag input objects reachable from public args. **Tagging guidance: trace BOTH return and argument types of a public field.**
- **Empty root types fail validation.** The plugin keeps `Query`/`Mutation` in every sub-graph but filters their fields, so a served sub-graph with no tagged mutation yields an empty `Mutation` object — which `assertValidSchema` (run by Yoga per request) rejects. Kit's `buildSchema(subGraph)` drops an empty `Mutation`/`Subscription` root (realm-safely, via `schema.constructor`) before serving. **Known limitation:** it does NOT drop an empty `Query` — a future mutations-only served sub-graph would need that handled (or a boot-time assertion that each served sub-graph has ≥1 query).
- **Test harness routing.** `bootTestApp` serves `/graphql` and each `/graphql/<name>` in-process via the matching Yoga's `.fetch` (the production `fromNodeHandler` mount doesn't run on h3's web-fetch path); `assembleApp` exposes the served sub-graph Yogas for this.

## Out of scope / follow-ups

- **Exhaustive tagging** of `account` / `org` / `admin` across all modules — incremental, per module, after the foundation.
- **B19 (B):** tagging `channelProducts` + the storefront product fields into `public` (its own plan, revised to add the tags).
- Per-endpoint transport-level auth baselines (e.g. requiring a key on `/graphql/public`); v1 relies on field `authScopes`.
- Retiring the full `/graphql` mount once `account`/`org`/`admin` are fully tagged.
- Schema-stitching / federation across services (this is a single-process schema split, not federation).
