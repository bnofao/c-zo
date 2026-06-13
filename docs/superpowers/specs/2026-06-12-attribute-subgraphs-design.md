# Attribute per-tier split + GraphQL sub-graph tagging — Design

**Date:** 2026-06-12
**Depends on:** the sub-graph foundation (#130) + auth sub-graph work (#131) — both merged to `main` (the kit enablement + the `org`/`admin` sub-graph names). **Branch off `main`.**

## Goal

Split `@czo/attribute`'s two tier-ambiguous top-level operations (`createAttribute`, `attributes`) into explicit org-tier and platform-tier variants (channel-style), then tag the whole surface into audience sub-graphs: platform-tier ops → `admin`, org-tier ops → `org`, and the row-tier-derived ops (single read, by-id update/delete, reorder, value-creates) into both `['org','admin']`. Attribute is the **original** platform-vs-org tier module (the one `@czo/channel` copied), so its `organizationId` is already nullable and platform attributes already work — there is **no schema migration and no new tier-authz helper**. The org list also gains an `includeGlobal: Boolean = false` arg (a small additive service change). This is a narrow GraphQL-surface change: split the two top-level ops, add the flag, then tag.

## Decisions (settled during brainstorming)

1. **Split create/list per tier** (channel-style), NOT keep-unified. Each audience gets a targeted op with a targeted input. **Naming** follows auth's `createApiKey`/`createOrganizationApiKey` convention — the **unqualified** name is the platform default, the **org-qualified** name carries the org: `createAttribute` (platform/`admin`) + `createOrganizationAttribute` (`org`); `attributes` (platform/`admin`) + `organizationAttributes` (`org`).
2. **Split top-level only.** The genuine tier-choice ops are `createAttribute` and the `attributes` list — split those. The 8 value-creates **keep their existing `organizationId` input and `valueCreateScope` authz unchanged**: the input is NOT redundant — when the parent is a **platform** attribute (org null), an org may graft an **org-scoped** value onto it (the overlay pattern, enforced by `ensureParentOwned`: `parent.org !== null && parent.org !== valueOrg → fail`; a passing integration test `createValue — org extends a PLATFORM attribute` covers it). So value-creates are a tagging-only change, tagged unified `['org','admin']`.
3. **Everything else stays unified `['org','admin']`** (single `attribute` query, by-id update/delete, reorders, the 8 value-creates, 9 nodes, inputs/enums, errors).
4. **No schema migration / no new authz helpers** — `organizationId` is already nullable on all 9 tables; `attributePermission`/`tierScope`/`attributeScope`/`valueCreateScope`/`loadAttributeOrg` already exist and are reused as-is. Platform-attribute slug uniqueness is already handled by the module today (platform creation already works via the current unified `createAttribute` with null org). The **only** service change is additive: `ReadScope.includeGlobal?` + a `visible()` org-only branch (Decision 7).
7. **`organizationAttributes` gains `includeGlobal: Boolean = false`** — org-only by default; opt in (`true`) to mix platform attributes into the org list. Carried by an additive, tri-state `ReadScope.includeGlobal?`/`visible()` change that leaves existing internal callers (undefined → platform ∪ org) untouched.
5. **No node-guard work** — all 9 nodes are already tier-derived guarded (`nodeReadScope` → global `attribute:read` for platform rows, org read for org rows). The platform-read alignment is already in `main`.
6. **No serving change** — `apps/life` already serves `org` + `admin`.

## Surface (from inspection)

Files under `packages/modules/attribute/src/graphql/`:
- **Queries** (`schema/queries.ts`): `attribute` (single, by id-or-slug, `attributeReadScope` row-tier), `attributes` (connection, optional `organizationId` arg).
- **Mutations** (`schema/mutations/{attribute,choice-value,typed-value}.ts`): `createAttribute`/`updateAttribute`/`deleteAttribute`; per value family (`value`/`swatch`/`reference`/`text`/`numeric`/`boolean`/`date`/`file`) a `create*`/`update*`/`delete*`, plus `reorderAttributeValues`/`reorderAttributeSwatches`/`reorderAttributeReferences`.
- **Tier authz** (`authz.ts`): `attributePermission(verb, org: number|null)`, `tierScope(org: number|null|undefined, verb)`, `loadAttributeOrg`/`loadValueOrg`, `valueCreateScope(orgInput)`, `valueScope(ctx, family, id, verb)`, `attributeScope(ctx, attrId, verb)`, `attributeReadScope(ctx, args)`, `decodeOrgInput`.
- **Nodes** (`schema/types.ts`): `Attribute` + 8 value nodes; all guarded via `nodeReadScope`.
- **Inputs/enums** (`schema/inputs.ts`, `schema/enums.ts`, `schema/scalars.ts`): `AttributeWhereInput`, `AttributeOrderByInput`, `AttributeOrderField`/`AttributeOrderDirection`, `AttributeTypeFilterInput`/`AttributeUnitFilterInput`, `AttributeType`/`AttributeUnit`, `FileInfo`/`FileInfoInput`. Kit-shared `StringFilterInput`/`BooleanFilterInput`/`DateTimeFilterInput`/`DateTime`/`JSONObject` reused.
- **Errors** (`schema/errors.ts`): 12 module errors (`AttributeNotFound`, `AttributeSlugTaken`, `AttributeDbFailed`, `ReferenceEntityRequired`, `ReferenceEntityNotAllowed`, `UnitNotAllowed`, `AttributeValueNotFound`, `AttributeValueSlugTaken`, `SwatchRequiresColorOrFile`, `SwatchVisualInvalid`, `AttributeParentNotOwned`, `TypedValueNotFound`).
- **No sub-graph tagging** exists yet; no `subgraphs.ts`.

## Architecture

### 1. Split `createAttribute` (`schema/mutations/attribute.ts`)

Naming follows the auth `createApiKey`/`createOrganizationApiKey` convention: the **unqualified** name is the platform default; the **org-qualified** name carries the org.

- **`createAttribute`** (audience `admin`, **platform**): input WITHOUT `organizationId`; authScope `attributePermission('create', null)` (global role); resolver calls `svc.create({ ..., organizationId: null })`.
- **`createOrganizationAttribute`** (audience `org`): input `organizationId` **required** (`t.globalID({ for: 'Organization', required: true })`); authScope `attributePermission('create', decodeOrgInput(args.input.organizationId))` (org is now always a number); resolver passes the org through to `svc.create`.

Both share the rest of the input fields (name, slug, type, unit, referenceEntity, isRequired, isFilterable, …) and the same `errors.types` (`AttributeSlugTaken`, `ReferenceEntityRequired`, `ReferenceEntityNotAllowed`, `UnitNotAllowed`). The service `create` already accepts a nullable org (it does today) — no service change for the attribute split.

### 2. Split the `attributes` list (`schema/queries.ts`)

Same convention: unqualified = platform default, org-qualified = org.

- **`attributes`** (audience `admin`, **platform**): no `organizationId` arg; authScope `attributePermission('read', null)` (global); lists `where: { organizationId: { isNull: true } }`. (Drizzle RQBv2 crashes on `where: { col: null }` — use `{ isNull: true }`.)
- **`organizationAttributes`** (audience `org`): `organizationId` arg **required**; authScope org `attribute:read` permission; plus an **`includeGlobal: Boolean = false`** arg controlling whether platform (org-null) attributes are mixed in:
  - `includeGlobal: false` (default) → **org-only** rows (`{ organizationId: <org> }`).
  - `includeGlobal: true` → **platform ∪ that org** (the previous always-on behavior).

  This changes the GraphQL org list's default (it previously always returned platform ∪ org), via a small **additive** service change. `ReadScope` gains an optional `includeGlobal?: boolean` with a **tri-state** so existing internal callers are unaffected: for an org scope, `visible()` returns org-only **only** on an explicit `includeGlobal: false`; `undefined` (every current caller) or `true` keeps the platform ∪ org behavior. The platform/admin path (`organizationId == null`) is unchanged. The `organizationAttributes` resolver passes `includeGlobal: args.includeGlobal ?? false`, so the GraphQL default is org-only while the service default for internal callers stays platform ∪ org.

The single `attribute` query is unchanged (audience `['org','admin']`); its `attributeReadScope` already derives the tier from the looked-up row.

### 3. Value-creates — tagging only, no behavior change (`schema/mutations/{choice-value,typed-value}.ts`)

All 8 value-creates (`createAttributeValue`/`Swatch`/`Reference`/`TextValue`/`NumericValue`/`BooleanValue`/`DateValue`/`FileValue`) keep their `organizationId` input field and their `valueCreateScope(args.input.organizationId)` authScope **unchanged**. The input is meaningful: omit/null → platform value (global `attribute:create`); set → org-scoped value (org `attribute:create`), which may graft onto a platform parent (overlay) or its own org's attribute. They are simply tagged unified `['org','admin']`.

No `authz.ts` change, no service change, no input change — `valueCreateScope` and `ensureParentOwned` are reused as-is.

### 4. Sub-graph tagging (`schema/subgraphs.ts` + tag sites)

A module-local `sg()` helper (identical to auth/stock-location/price/channel/inventory) tags each `relayMutationField` at 5 points. Audience mapping:

| Audience | Ops | Types |
| --- | --- | --- |
| `admin` (platform) | `createAttribute`, `attributes` | — (share the unified create/where inputs below) |
| `org` | `createOrganizationAttribute`, `organizationAttributes` | the org create input (carries required `organizationId`) |
| `['org','admin']` | single `attribute` query; the 8 value-creates; `updateAttribute`/`deleteAttribute`; all value `update*`/`delete*`; the 3 `reorder*`; | the 9 nodes (`Attribute` + 8 value nodes); `AttributeWhereInput`, `AttributeOrderByInput`, `AttributeOrderField`/`AttributeOrderDirection`, `AttributeTypeFilterInput`/`AttributeUnitFilterInput`, `AttributeType`/`AttributeUnit`, `FileInfo`/`FileInfoInput`; all 12 module errors |

The platform `createAttribute` input (no org) is tagged `admin`; the `createOrganizationAttribute` input (required org) is tagged `org`. `drizzleConnection`s (`attributes` → `admin`, `organizationAttributes` → `org`, and the Attribute node's `relatedConnection`s `values`/`swatchValues`/`referenceValues` → `['org','admin']`) are tagged at all 3 positions (field + connection-type + edge-type). Kit-shared `ValidationError`/`OptimisticLockError`/`StringFilterInput`/`BooleanFilterInput`/`DateTimeFilterInput` are tagged centrally in kit — NOT per-module.

Tagging all 12 module errors into `['org','admin']` is harmless over-tagging (an error type present in both schemas leaks nothing) and avoids fragile per-error audience analysis; every error is in fact referenced by ops in both audiences (create errors by both `createAttribute` (platform) and `createOrganizationAttribute` (org); the rest by unified by-id ops).

### 5. node-guards & serving

No change. `attributeNodeGuards` already guards the 9 nodes via `nodeReadScope` (tier-derived). `apps/life` already serves `org` + `admin`.

## Data flow

```
admin (global attribute:create) → POST /graphql/admin  createAttribute(input: { name, slug, type, … })
  → attributePermission('create', null) → global role ✓ → svc.create({ …, organizationId: null }) → platform Attribute
org member (attribute:create in A) → POST /graphql/org  createOrganizationAttribute(input: { organizationId: A, … })
  → attributePermission('create', A) → org role ✓
value create → POST /graphql/{org|admin}  createAttributeValue(input: { attributeId: P, organizationId?, value, … })
  → valueCreateScope(organizationId) → attributePermission('create', org|null)  (omit→global, set→org role)
  → svc.createValue → ensureParentOwned (org may graft onto a platform parent; else parent.org must match)
node(id: <platform Attribute|value>) on /graphql/{org|admin}
  → nodeReadScope(row) → attributePermission('read', row.organizationId) → global (null) or org role ; else null
```

## Error handling / security

- **Tier authz never weaker via node():** the node guards already mirror the read scope (`nodeReadScope` = `attributePermission('read', row.org)`); unchanged.
- **No existence oracle:** unknown/forbidden id → `null` (node) / `AttributeNotFound` (by-id) uniformly; by-id `tierScope` returns `{ auth: true }` for `undefined` (not-found) to defer to the 404 rather than mask as 403.
- **Platform isolation:** an org member without the global `attribute` role cannot create/list platform attributes (the global-role scope denies); the split makes the platform ops only reachable on `/graphql/admin`.
- **Value parent-ownership unchanged:** `ensureParentOwned` still gates value-creates — an org value may graft onto a platform parent or its own org's attribute, but never onto another org's attribute (`AttributeParentNotOwned`).
- **Exposure ≠ authz:** the `org`/`admin` tags control which endpoint exposes a field; the tier-aware authScope is the gate. Under-tagging a mutation silently drops it — the exposure E2E presence assertions are the guard.

## Testing

- **Exposure E2E** (`src/e2e/subgraph-exposure.e2e.test.ts`, harness extended to serve sub-graphs): `/graphql/admin` Mutation has `createAttribute` + the value-creates + `updateAttribute`/`deleteAttribute`/reorders, Query has `attribute`/`attributes`, but NOT `createOrganizationAttribute`/`organizationAttributes`; `/graphql/org` has `createOrganizationAttribute`/`organizationAttributes` + the unified ops (single `attribute` query, value-creates, update/delete/reorder), but NOT the platform `createAttribute`/`attributes`. Silent-drop guard via introspection.
- **Authz E2E** (extend the existing suites): platform `createAttribute` allowed for a global-`attribute:create` holder, denied for a plain org member; `createOrganizationAttribute` requires the org role and the required org arg. Value-create authz is **unchanged** and already covered (omit org → global; set org → org role, incl. the org-graft-onto-platform case).
- **Existing E2E updated** for the split: platform creation stays on `createAttribute` (now org-less) — assert it no longer accepts an org; org creation moves to `createOrganizationAttribute` with the required `organizationId`; org listing moves to `organizationAttributes` (any call expecting platform rows mixed in now passes `includeGlobal: true`). **Value-create calls are unchanged** (they keep `organizationId`). The existing node-authz E2E stays green (no guard change).
- **`includeGlobal` service test**: a `ReadScope`/`visible()` integration test (`services/scoping.integration.test.ts`) — for an org, explicit `includeGlobal: false` returns org-only rows; `includeGlobal: true` (and the legacy omitted/`undefined`) returns platform ∪ org (the existing platform-∪-org test stays green). The admin/platform path (`organizationId == null`) is unaffected.

## Out of scope / follow-ups

- Tagging the remaining org-scoped module (`translation` — may have a `public` nuance for locales).
- Any storefront/public read surface for attributes (deferred; product is the public read path).
