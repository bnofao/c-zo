# Hard-delete product adoptions — design

**Date:** 2026-06-17
**Status:** Approved — ready for implementation plan
**Area:** `@czo/product` — `AdoptionService` / `product_org_adoptions`

## Goal

Make un-adopt a true `DELETE` of the `product_org_adoptions` row, and remove the two columns that
turned out to be vestigial for this entity: `deletedAt` (soft-delete) and `version` (optimistic
lock). One sentence: an adoption is a membership link, so when an org un-adopts, the row goes away.

## Why

`product_org_adoptions` records that an org adopted a global product into its catalog. Today
un-adopt **soft-deletes** the row (`deletedAt = NOW()`). Tracing the full lifecycle shows the
soft-delete buys nothing here:

- **No read ever sees a dead row.** All three query sites — `findLiveAdoption`,
  `listAdoptedProducts`, `listAdopters` — filter `deletedAt IS NULL`. The products-list query in
  `queries.ts` does the same via the `adoptions` relation.
- **Re-adopt never reuses the dead row.** `adoptProduct` does a fresh `INSERT` (the partial unique
  index `WHERE deletedAt IS NULL` allows it). The tombstone is never resurrected.
- **Everything the adoption governed is already hard-deleted** on un-adopt: `purgeOrgAttributeGrafts`
  + `purgeOrgPriceInventoryGrafts` + `purgeOrgMediaChannelGrafts` really delete the org's grafts. So
  re-adopting is a clean slate, not a restoration — there is nothing for the tombstone to protect.
- **Nothing references `productOrgAdoptions.id`.** The only FK is `adoption → products`. A hard
  delete breaks no references.
- **`version` is dead.** Nothing reads or increments the adoption's `version`; un-adopt sets
  `updatedAt` but not `version`. The optimistic-lock convention was never wired in for this entity.

So the soft-delete only leaves a passive tombstone that accumulates on every unadopt/re-adopt cycle,
and is inconsistent with the hard purge of every graft the adoption owned.

This **intentionally deviates** from the project conventions ("entities use `deletedAt`, never hard
delete" and "entities use `version` for concurrency control"). Those conventions target **content**
entities (products, variants, …) where soft-delete enables recovery and preserves references.
`product_org_adoptions` is a pure org↔product membership link — like a session or a join row — where
neither mechanism was ever used. If adoption history is wanted later, a `product.unadopted` domain
event captures it better than a tombstone (see "Future").

## Changes

### 1. Schema (`src/database/schema.ts`) + migration

Drop `deletedAt` and `version` from `productOrgAdoptions`. Replace the partial unique index with a
plain one.

```ts
export const productOrgAdoptions = pgTable('product_org_adoptions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1, increment: 1 }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull(),
  adoptedAt: timestamp('adopted_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [
  uniqueIndex('product_org_adoptions_uniq').on(t.productId, t.organizationId),
  index('product_org_adoptions_org_idx').on(t.organizationId),
])
```

Generated migration (via `pnpm --filter @czo/product migrate:generate`) is expected to:

```sql
DROP INDEX "product_org_adoptions_uniq";
ALTER TABLE "product_org_adoptions" DROP COLUMN "deleted_at";
ALTER TABLE "product_org_adoptions" DROP COLUMN "version";
CREATE UNIQUE INDEX "product_org_adoptions_uniq" ON "product_org_adoptions" ("product_id","organization_id");
```

`ProductOrgAdoption` is `InferSelectModel<typeof productOrgAdoptionsTable>`, so its type drops the two
fields automatically — no separate type edit.

### 2. Service (`src/services/adoption.ts`)

- **`findLiveAdoption` → `findAdoption`**: drop the `deletedAt: { isNull: true }` filter (rename to
  reflect that there is no longer a live/dead distinction). Update its callers (`adoptProduct`
  idempotency check, `unadoptProduct`, `isAdopted`).
- **`unadoptProduct`**: replace the soft-delete UPDATE with a hard delete, keep the three graft
  purges, return the deleted row (signature unchanged — `unadoptProduct` still returns
  `ProductOrgAdoption`):

  ```ts
  const adoption = yield* findAdoption(productId, orgId)
  if (!adoption)
    return yield* Effect.fail(new AdoptionNotFound())

  const [deleted] = yield* dbErr(
    db.delete(productOrgAdoptionsTable)
      .where(sql`${productOrgAdoptionsTable.id} = ${adoption.id}`)
      .returning(),
  )

  yield* purgeOrgAttributeGrafts(productId, orgId)
  yield* purgeOrgPriceInventoryGrafts(productId, orgId)
  yield* purgeOrgMediaChannelGrafts(productId, orgId)

  return deleted! as ProductOrgAdoption
  ```

- **`adoptProduct`**: idempotency check now uses `findAdoption`; the plain unique index guards
  against a concurrent double-adopt. Re-adopt after a delete simply inserts a fresh row — there is no
  dead row to dodge, so the "fresh INSERT" comment is updated accordingly.

### 3. One external consumer (`src/graphql/schema/product/queries.ts`)

The adopted-products filter currently reads:

```ts
const base = { adoptions: { organizationId: orgId, deletedAt: { isNull: true } }, deletedAt: { isNull: true } }
```

Drop the **adoptions** `deletedAt` clause; keep the product-level `deletedAt` (products keep
soft-delete):

```ts
const base = { adoptions: { organizationId: orgId }, deletedAt: { isNull: true } }
```

### 4. No GraphQL schema change

`product_org_adoptions` is not exposed as a relay node or GraphQL field — there is no `.graphql` /
Pothos surface to touch.

## Testing

`src/services/adoption.integration.test.ts` (runs on the cross-module layer):

- Drop `expect(adoption.deletedAt).toBeNull()` from the adopt test (column gone).
- Drop `deletedAt: { isNull: true }` from the `adoptions` relational `where` at the two
  `findProducts` adoption-filter cases.
- **Keep** these cases as the hard-delete regression guard — they already assert the right
  behaviour, now against `DELETE` instead of soft-delete:
  - `unadopt → isAdopted false afterward`
  - `re-adopt after unadopt → OK (isAdopted true again)` — proves the plain unique index permits
    re-insert after a hard delete.
  - `double adopt → idempotent (no error, still one live row)` — proves idempotency without a
    `deletedAt` partition.
  - `unadopt when not adopted → AdoptionNotFound`.
- Add one assertion that after `unadoptProduct`, **no** `product_org_adoptions` row exists for
  `(productId, orgId)` (direct `db.query.productOrgAdoptions.findFirst` returns `undefined`) — the
  positive proof that the row is gone, not tombstoned.

Validation: `pnpm --filter @czo/product migrate:generate` (review SQL), then
`pnpm --filter @czo/product check-types`, `pnpm --filter @czo/product lint --max-warnings 0`,
`pnpm --filter @czo/product test src/services/adoption.integration.test.ts`, and the broader
`adoption`-touching e2e (`product-org`, `channel-grafts`) to confirm un-adopt + purge still pass.
Also `pnpm --filter life check-types`.

## Out of scope

- Other entities' soft-delete / `version` usage is unchanged. This is a targeted decision for the
  adoption link only.
- No domain event is added now (see Future).

## Future

If adoption history becomes a requirement (churn analysis, re-adoption patterns), emit a
`product.unadopted` event from `unadoptProduct` into the module's event stream rather than
reintroducing a tombstone column.
