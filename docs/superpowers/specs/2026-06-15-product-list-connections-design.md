# Product Top-Level Lists → Relay Connections (full parity) — Design

**Date:** 2026-06-15
**Module:** `@czo/product`
**Status:** draft, pending user review

## Goal

Convert all seven of `@czo/product`'s top-level **list** queries from plain `type: ['T']` arrays to relay **`drizzleConnection`s** with full inventory/price parity — relay pagination + a per-entity `WhereInput` filter, `OrderByInput`, and free-text `search` — so the product module matches the rest of the platform (inventory `inventoryItems`, price `priceSets`/`priceLists`). Today product is the lone module whose top-level lists don't paginate, even though its own graft fields already use `relatedConnection`.

Single-row lookups (`productType`, `product`, `productByHandle`, `category`, `collection`) and the storefront/graft fields are **unchanged**.

## Why now / why it's safe

The org-merge is not a blocker: product's graft `relatedConnection`s already paginate a base∪org set via `mergeWhere(viewerOrg)` (`types/merge.ts`). Top-level lists can use the identical predicate. The plain-list style was a historical artifact of the original product sprint (#120), never converted.

## The seven queries

| Query | node | sub-graphs | base clause | search | WhereInput fields | OrderBy fields |
|---|---|---|---|---|---|---|
| `productTypes` | ProductType | `['org','admin']` | `mergeWhere(viewerOrg)` | name, slug | `isShippingRequired` (Bool) | name, createdAt |
| `products` | Product | `['org','admin']` | `mergeWhere(viewerOrg)` | name, handle | `productTypeId` (Int), `status` if present | name, createdAt |
| `categories` | Category | `['org','admin']` | `mergeWhere(viewerOrg)` | name, slug | `parentId` (Int) | name, position, createdAt |
| `collections` | Collection | `['org','admin']` | `{ organizationId }` | name, slug | — | name, createdAt |
| `adoptedProducts` | Product | `['org','admin']` | **adoptions join** ⚠️ (spike) | name, handle | `productTypeId` (Int) | name, createdAt |
| `taxonomyRequests` | TaxonomyRequest | `['admin']` | — | — | `kind`/`entityType`/`state` (enum-equals) | createdAt |
| `organizationTaxonomyRequests` | TaxonomyRequest | `['org']` | `{ organizationId }` | — | `kind`/`state` (enum-equals) | createdAt |

The existing **required scope arg** (`viewerOrg` / `organizationId`) stays on each — it is the tenant boundary, always enforced. The current single `state` arg on `taxonomyRequests` is absorbed into its `WhereInput`.

## Pattern (mirrors inventory exactly)

Each list becomes:

```ts
builder.queryField('productTypes', t =>
  t.drizzleConnection({
    type: 'productTypes',
    subGraphs: ['org', 'admin'],
    description: '…paginated…',
    authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.viewerOrg.id) } }),
    args: {
      viewerOrg: t.arg.globalID({ for: 'Organization', required: true, description: '…' }),
      search: t.arg.string({ description: 'Free-text search across name and slug.' }),
      where: t.arg({ type: 'ProductTypeWhereInput', description: 'Optional filter predicate.' }),
      orderBy: t.arg({ type: ['ProductTypeOrderByInput'], description: 'Ordering; defaults to createdAt desc.' }),
    },
    resolve: async (query, _root, args, ctx) =>
      ctx.runEffect(Effect.gen(function* () {
        const svc = yield* ProductTypeService
        const base = mergeWhere(viewerOrgId(args))                 // base∪org
        const searchClause = args.search?.trim()
          ? { OR: [{ name: { ilike: `%${args.search.trim()}%` } }, { slug: { ilike: `%${args.search.trim()}%` } }] }
          : null
        const userWhere = (args.where ?? null) as Record<string, unknown> | null
        const where = { AND: [base, userWhere, searchClause].filter(Boolean) }
        return yield* svc.findTypes(query({
          where: where as any,
          orderBy: args.orderBy?.length ? args.orderBy.map(o => ({ [o.field]: o.direction })) : { createdAt: 'desc' },
        }))
      })) as Promise<any>,
  }, { subGraphs: ['org', 'admin'] }, { subGraphs: ['org', 'admin'] }))   // 3-position tag: connection + edge
```

The trailing two positional args tag the generated `*Connection` and `*Edge` types (the relatedConnection silent-drop discovery applies to `drizzleConnection` too).

### Input types (per entity, in `inputs.ts` + a TS interface in `graphql/index.ts`)

- **`<Entity>WhereInput`** via `builder.inputRef<T>('<Entity>WhereInput').implement({ subGraphs, fields })`. Scalar fields use the **kit shared filter inputs** (`StringFilterInput`, `IntFilterInput`, `BooleanFilterInput`, `IDFilterInput` — already registered + sub-graph-tagged centrally by kit). Enum fields (state/kind/entityType) take the enum ref directly (equals semantics). Recursive `AND`/`OR`/`NOT`. A matching TS `interface <Entity>WhereInput` is declared in `graphql/index.ts` and added to the builder `Inputs`/SchemaTypes map (mirroring `InventoryItemWhereInput`).
- **`<Entity>OrderField`** enum + reuse a shared `OrderDirection` enum (or a per-entity `<Entity>OrderDirection`, matching inventory) + **`<Entity>OrderByInput`** inputType `{ field, direction }`, with a Zod enum guard like inventory's.
- All input/enum types are tagged to the **same sub-graphs as their query** (`['org','admin']`, or `['admin']` / `['org']` for the taxonomy ones).

### Service changes

Each `list*(orgId)` becomes a query-accepting `find*(config)` returning the drizzle `findMany` result, mirroring `InventoryService.findItems(config)`:

```ts
type FindTypesConfig = Parameters<Database<Relations>['query']['productTypes']['findMany']>[0]
readonly findTypes: (config: FindTypesConfig) => Effect.Effect<ReadonlyArray<ProductType>, ProductTypeDbFailed>
```

The base∪org merge moves OUT of the service into the resolver's composed `where` (the service becomes a thin query-runner, as inventory's is). If a removed `list*(orgId)` method has OTHER callers, keep it (or repoint them); the plan audits each.

## The `adoptedProducts` spike (Plan Task 1)

`adoptedProducts` lists products an org has **adopted** (join through `product_org_adoptions`), not a `products` filter. Before fanning out, the plan verifies whether Drizzle RQBv2 `where` supports a relational predicate on `products` (e.g. `{ adoptions: { organizationId } }` / a `RelationsFilter`):

- **If yes:** `adoptedProducts` becomes a `drizzleConnection({ type: 'products', … })` with the adoption relation in its base `where`.
- **If no:** `adoptedProducts` **stays a plain list** (explicitly excluded from this conversion, documented), or — only if cheap — a hand-rolled relay connection. The spike result is recorded; we do not block the other six on it.

## Sub-graph tagging

Each converted connection **preserves its query's current sub-graph tags** (the table above reflects them; the implementer confirms against the source query and uses the actual tags). Connections, their `WhereInput`/`OrderByInput`/order enums, and the kit filter inputs they reference must all be present on the query's audiences. The kit filter inputs are tagged centrally (no per-module work). The exposure E2E is the guard (a mis-tagged input silently drops the field).

## Out of scope

- Single-row lookups and storefront/graft fields (unchanged).
- New filterable fields beyond the per-entity sets above (add later as needed — YAGNI per field).
- Cursor semantics customization (relay default keyset is fine).

## Testing

- Service: each `find*(config)` returns the rows for a `where`/`orderBy` config (a couple of cases per service incl. the merge predicate for the merged ones).
- E2E: for each connection, `{ <name>(first: N, viewerOrg|organizationId, where, orderBy, search) { edges { node { id } } pageInfo { hasNextPage endCursor } } }` paginates, filters, searches, and orders; the org-merge still surfaces base∪org for the merged ones; tenant scoping holds (no cross-org leakage).
- Exposure E2E: each connection + its inputs present on the right sub-graphs, absent from `public`; the `*Connection`/`*Edge` types resolve (3-position tag check).
- The existing single-row-lookup tests stay green.

## Validation

- `pnpm --filter @czo/product generate` only if any `.graphql` files are touched (these are Pothos code-first — none expected).
- `pnpm --filter @czo/product check-types`, `lint --max-warnings 0`, `test`.
- `pnpm --filter life check-types`.
- No migration.
