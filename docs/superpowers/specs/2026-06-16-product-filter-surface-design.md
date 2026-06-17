# Product Filter Surface — `IDFilterInput` WhereInput + Attribute Faceting — Design

**Date:** 2026-06-16
**Module:** `@czo/product`
**Status:** approved, pending spec review
**Branch:** continue on `feat/productbyhandle-publication-filter`

## Goal

Make `ProductWhereInput` a real storefront filter surface. Today it carries only `productTypeId` (a raw `IntFilterInput`) + `AND/OR/NOT`. Two problems:

1. **Contract bug.** `productTypeId: IntFilterInput` demands a raw int, but every product-type id a client holds is a relay **globalID** (`ProductType` is a relay node). The filter is unusable through the public contract and invites poking at raw PKs. Same latent issue would hit any FK filter.
2. **Too thin for a storefront.** Now that `ProductWhereInput` is `['public']` (consumed by `channelProducts`), it must let a storefront filter on the product's own columns, by product type / category / collection, and **facet by attribute**. Only free-text `search` (ilike name+handle) exists today.

## Approach

Keep a **single** `ProductWhereInput` (no id-args), and introduce a module-owned translator `buildProductWhere(input)` that maps the GraphQL filter to a Drizzle RQBv2 `where`.

### Why a translator now

`StringFilter`/`IntFilter` pass straight into Drizzle today only because their field names (`eq`/`ilike`/`in`) coincide with RQBv2 operator names — `userWhere as any` is handed to Drizzle untouched. `IDFilter` (kit, `builder.ts`) **cannot** pass through:

- its fields are `eq: t.globalID()`, `in/notIn: t.globalIDList()` — Pothos relay **decodes** these inputs to `{ typename, id }` (not the raw int Drizzle's FK column needs);
- it targets a relay node, not a column, so `{ productType: { eq: <gid> } }` must become `{ productTypeId: { eq: <int> } }`.

**Kit bug fixed en route.** The kit `IDFilter` interface declared `eq?: string` / `in?: string[]`, but `@pothos/plugin-relay@4.7.0` resolves a `t.globalID()` input to `GlobalIDInputShape = { typename, id }`. `builder.inputRef<IDFilter>(…)` overrides Pothos's inference, so the wrong type compiled silently — and product is the first consumer, so the lie was dormant. We correct `IDFilter` to the honest `{ typename, id }` shape (new exported `GlobalIDValue`) so the translator and every future consumer read `.id` without casts.

Product is the **first consumer of `IDFilterInput` in the codebase**, so the translate step is new work we own. It also retires the `userWhere as any` cast (the translator returns a Drizzle-shaped object).

## `ProductWhereInput` (final shape) — `subGraphs: ['public','org','admin']`

| field | type | translates to (Drizzle) |
|---|---|---|
| `name` | `StringFilterInput` | `{ name: <passthrough> }` |
| `handle` | `StringFilterInput` | `{ handle: <passthrough> }` |
| `productType` | `IDFilterInput` | `{ productTypeId: <int eq/in/notIn> }` (own FK column) |
| `categories` | `IDFilterInput` | `{ categories: { categoryId: <int eq/in/notIn> } }` (relational exists) |
| `collections` | `IDFilterInput` | `{ collections: { collectionId: <int eq/in/notIn> } }` (relational exists) |
| `AND` / `OR` / `NOT` | `[ProductWhereInput!]` / self | recurse + combine |

**Attribute faceting is out of scope** — it crosses into `@czo/attribute` (slug/name/typed values live there; product holds only `attributeId`/`valueId`/`valueKind`, with no FK/relation) and the attribute services are CRUD-only, so it needs new cross-module read APIs + a two-phase async resolution. It gets its own sprint.

`productTypeId` (the old raw-int field) is **removed**. Relation FKs (confirmed): `products.productTypeId`; `productCategories.categoryId` (relation `categories`); `collectionProducts.collectionId` (relation `collections`).

### `buildProductWhere(input)` rules

- **StringFilter fields** (`name`,`handle`): emitted as-is (already Drizzle operator shape).
- **IDFilter fields**: decode each present `eq`/`in`/`notIn` globalID → `Number(id)`; emit an int filter `{ eq?, in?, notIn? }` on the mapped column. For `categories`/`collections` wrap it in the relational `{ <relation>: { <fkColumn>: <intFilter> } }` (exists semantics).
- **`AND`/`OR`/`NOT`**: recurse, mapping each sub-input through `buildProductWhere`, and emit Drizzle `{ AND: [...] }` / `{ OR: [...] }` / `{ NOT: ... }`.
- Omitted fields contribute nothing.

The three list connections (`products`, `organizationProducts`, `channelProducts`) replace their `const userWhere = (args.where ?? null) as ...` line with `const userWhere = args.where ? buildProductWhere(args.where) : null` and keep composing it into their existing top-level `AND` (with the base/live/search clauses).

## Spike (gates implementation — Step 1)

Before any GraphQL wiring, a Postgres integration test confirms **operator filters inside a relational where** work (`{ categories: { categoryId: { in: [...] } } }` resolves) — the adoptions spike already proved scalar-equality relational where; this confirms the operator form `categories`/`collections` rely on. If it fails, fall back to `inArray(products.id, <subquery>)` (documented in the plan, not built unless needed).

## Graft-scope nuance (accepted)

`categories` is a graft (org-scoped via `organizationId`). A public `categories` filter therefore matches a published product categorised under X by **any** org (base or graft). Acceptable: categorisation is not confidential and the product is already publication-gated. Precise per-publishing-org category scoping waits on the deferred `listing.organizationId` graft-resolution sprint. `collections` (global link table, not a graft) and `productType` (own column) have no such nuance.

## Out of scope

- **Attribute faceting** (`ProductAttributeWhereInput` / typed `ProductAttributeValueWhereInput`) — cross-module into `@czo/attribute`; its own sprint (designed next).
- Per-publishing-org graft resolution for category/price/media (deferred sprint).
- Fixing `CategoryWhereInput.parentId` (same raw-int issue, different connection) — note it, don't build it here unless asked.

## Testing

- **Spike** integration test (above) — first, gating.
- **Translator** unit/integration: `productType`/`categories`/`collections` IDFilter (eq/in/notIn) decode + map; `name`/`handle` passthrough; `AND/OR/NOT` recursion.
- **E2E (`['public']`, `channelProducts`)**: seed products live on a channel with differing product types, categories, collections; assert `productType`, `categories`, `collections`, `name`, `handle`, and a compound (AND) filter each narrow correctly.
- **Exposure**: `IDFilterInput`/`ProductAttributeValueFilterInput` reachable on `/graphql/public`; no regression to `subgraph-exposure`.

## Validation

- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0` (run `lint`, not `lint:fix` — preserves needed enum-ref `as any`), `test`.
- `pnpm --filter life check-types`.
- No migration (filters only).
