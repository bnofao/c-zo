# Hard-delete Product Adoptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make un-adopt a true `DELETE` of the `product_org_adoptions` row, and drop the vestigial `deletedAt` (soft-delete) and `version` (optimistic-lock) columns.

**Architecture:** `product_org_adoptions` is an org↔product membership link. Un-adopt already hard-purges every graft the adoption governed, no read ever sees a tombstoned row, and re-adopt always inserts fresh — so the soft-delete and `version` columns are dead weight. We drop both columns, swap the partial unique index for a plain one, and replace the soft-delete UPDATE with a hard `DELETE`.

**Tech Stack:** Drizzle ORM (RQBv2, `@effect/sql-pg`), Effect-TS, Pothos GraphQL, Vitest + Testcontainers, drizzle-kit migrations.

## Global Constraints

- Effect-native module: no `async`/`await`/`try`/`catch` in service code; compose with `Effect.gen` / `dbErr`.
- Immutability; match existing style; surgical changes only.
- Validation uses `pnpm lint` (NOT `lint:fix` — it strips needed casts) with `--max-warnings 0`.
- Integration tests run on Testcontainers via the cross-module layer; no `TEST_DATABASE_URL`.
- Per repo policy, the final step **stages** changes (`git add`); the actual commit happens after user review. Do not `git commit` autonomously, never commit to `main`.
- Migrations are generated with `pnpm --filter @czo/product migrate:generate` (drizzle-kit) — never hand-author the snapshot.

---

### Task 1: Hard-delete adoptions; drop `deletedAt` + `version`

This is a single atomic change: dropping the two columns breaks `check-types` (the service and the products query reference `deletedAt`) until the service, the GraphQL query, and the tests are updated in the same change. It carries one TDD cycle and one deliverable: un-adopt deletes the row, and the two columns are gone.

**Files:**
- Modify: `packages/modules/product/src/database/schema.ts:77-89` (table def + indexes)
- Create: `packages/modules/product/migrations/<generated>/` (via `migrate:generate`)
- Modify: `packages/modules/product/src/services/adoption.ts` (`findLiveAdoption`→`findAdoption`, `unadoptProduct`, `adoptProduct` comment, `isAdopted` caller)
- Modify: `packages/modules/product/src/graphql/schema/product/queries.ts:270` (adopted-products filter)
- Test: `packages/modules/product/src/services/adoption.integration.test.ts`

**Interfaces:**
- Consumes: `DrizzleDb` (`@czo/kit/db`), `productOrgAdoptions` table, `AdoptionService` (`adoptProduct`, `unadoptProduct`, `isAdopted`), `ProductService.findProducts`.
- Produces: `AdoptionService` surface is unchanged — `unadoptProduct({ productId, orgId })` still returns `ProductOrgAdoption` (now the deleted row). `ProductOrgAdoption = InferSelectModel<typeof productOrgAdoptions>` loses its `deletedAt` and `version` fields automatically. The relational filter for "products adopted by org N" becomes `{ adoptions: { organizationId: N } }` (no `deletedAt`).

---

- [ ] **Step 1: Write the failing test — prove un-adopt removes the row, and drop `deletedAt` from the suite**

In `packages/modules/product/src/services/adoption.integration.test.ts`:

(a) Add the `DrizzleDb` import at the top, after the existing imports:

```ts
import { DrizzleDb } from '@czo/kit/db'
```

(b) Replace the `unadopt → isAdopted false afterward` test (currently lines ~110-119) with a version that also asserts the row is physically gone:

```ts
  it.effect('unadopt → isAdopted false afterward + row hard-deleted', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.unadoptProduct({ productId: p.id, orgId: 1 })
      const adopted = yield* svc.isAdopted({ productId: p.id, orgId: 1 })
      expect(adopted).toBe(false)
      // Hard delete: NO row remains for (product, org) — not even a tombstone.
      const db = yield* DrizzleDb
      const row = yield* db.query.productOrgAdoptions.findFirst({
        where: { productId: p.id, organizationId: 1 },
      })
      expect(row).toBeUndefined()
    }))
```

(c) In the `adopt a global product → row created` test (lines ~45-56), delete this line (the column is going away):

```ts
      expect(adoption.deletedAt).toBeNull()
```

(d) In BOTH `findProducts` adoption-filter cases (lines ~201 and ~218), drop the `deletedAt` clause from the `adoptions` relation:

```ts
        where: { adoptions: { organizationId: 1 } } as any,
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @czo/product test src/services/adoption.integration.test.ts`
Expected: FAIL — the new `unadopt → … + row hard-deleted` case fails its final assertion (`expect(row).toBeUndefined()` receives the still-present soft-deleted row, because `unadoptProduct` currently sets `deletedAt` instead of deleting).

- [ ] **Step 3: Drop the columns and flatten the unique index in the schema**

In `packages/modules/product/src/database/schema.ts`, replace the `productOrgAdoptions` definition (lines 77-89) with:

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

(If `sql` is now unused in `schema.ts` after removing the partial-index `.where(sql\`…\`)`, leave the import — other tables in this file use it. Verify with a quick grep; do not remove an import other code needs.)

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @czo/product migrate:generate`
Expected: a new `migrations/<timestamp>_<name>/` folder. Open its `migration.sql` and confirm it drops the index, drops both columns, and creates the plain unique index — equivalent to:

```sql
DROP INDEX "product_org_adoptions_uniq";
ALTER TABLE "product_org_adoptions" DROP COLUMN "deleted_at";
ALTER TABLE "product_org_adoptions" DROP COLUMN "version";
CREATE UNIQUE INDEX "product_org_adoptions_uniq" ON "product_org_adoptions" USING btree ("product_id","organization_id");
```

(Column/statement order may differ; the three effects must all be present. Do not edit the generated `snapshot.json` by hand.)

- [ ] **Step 5: Hard-delete in the service**

In `packages/modules/product/src/services/adoption.ts`:

(a) Rename `findLiveAdoption` → `findAdoption` and drop the `deletedAt` filter (lines ~93-97):

```ts
  /** Find the adoption row for (productId, orgId), or undefined. */
  const findAdoption = (productId: number, orgId: number) =>
    dbErr(db.query.productOrgAdoptions.findFirst({
      where: { productId, organizationId: orgId },
    }))
```

(b) Update the `adoptProduct` idempotency check (line ~230) and its comment (line ~234):

```ts
      // 3. Idempotent: if an adoption already exists, return it
      const existing = yield* findAdoption(productId, orgId)
      if (existing)
        return existing as ProductOrgAdoption

      // 4. Insert fresh adoption row (the unique index guards against duplicates)
```

(c) Replace the `unadoptProduct` soft-delete (lines ~244-271) with a hard delete; keep the three purges and return the deleted row:

```ts
  const unadoptProduct: AdoptionServiceImpl['unadoptProduct'] = ({ productId, orgId }) =>
    Effect.gen(function* () {
      // 1. Find the adoption
      const adoption = yield* findAdoption(productId, orgId)
      if (!adoption)
        return yield* Effect.fail(new AdoptionNotFound())

      // 2. Hard-delete it — adoption is a membership link, not soft-deletable content.
      const deleted = yield* dbErr(Effect.gen(function* () {
        const [row] = yield* db
          .delete(productOrgAdoptionsTable)
          .where(sql`${productOrgAdoptionsTable.id} = ${adoption.id}`)
          .returning()
        return row! as ProductOrgAdoption
      }))

      // 3. Remove this org's grafts for the product (attributes, price/inventory, media/channel).
      yield* purgeOrgAttributeGrafts(productId, orgId)
      yield* purgeOrgPriceInventoryGrafts(productId, orgId)
      yield* purgeOrgMediaChannelGrafts(productId, orgId)

      return deleted
    })
```

(d) Update the `isAdopted` caller (line ~274) to use the renamed helper:

```ts
  const isAdopted: AdoptionServiceImpl['isAdopted'] = ({ productId, orgId }) =>
    findAdoption(productId, orgId).pipe(
      Effect.map(row => row !== undefined),
    )
```

- [ ] **Step 6: Drop the `deletedAt` clause from the adopted-products query**

In `packages/modules/product/src/graphql/schema/product/queries.ts`, change line 270:

```ts
            const base = { adoptions: { organizationId: orgId }, deletedAt: { isNull: true } }
```

(The remaining `deletedAt: { isNull: true }` is the **product** filter — products keep soft-delete — and stays.)

- [ ] **Step 7: Type-check, lint, and run the test to verify it passes**

Run: `pnpm --filter @czo/product check-types`
Expected: PASS (no references to the dropped `deletedAt`/`version` remain).

Run: `pnpm --filter @czo/product lint --max-warnings 0`
Expected: PASS, 0 warnings.

Run: `pnpm --filter @czo/product test src/services/adoption.integration.test.ts`
Expected: PASS — including `unadopt → … + row hard-deleted`, `re-adopt after unadopt → OK` (plain unique index permits re-insert after a hard delete), `double adopt → idempotent`, and `unadopt when not adopted → AdoptionNotFound`.

- [ ] **Step 8: Run the adoption-touching e2e + life type-check, then stage**

Run: `pnpm --filter @czo/product test src/e2e/product-org.e2e.test.ts src/e2e/channel-grafts.e2e.test.ts`
Expected: PASS — un-adopt + purge flows still green end-to-end.

Run: `pnpm --filter life check-types`
Expected: PASS.

Stage the change (commit awaits user review, per repo policy):

```bash
git add packages/modules/product/src/database/schema.ts \
        packages/modules/product/migrations \
        packages/modules/product/src/services/adoption.ts \
        packages/modules/product/src/graphql/schema/product/queries.ts \
        packages/modules/product/src/services/adoption.integration.test.ts
```

Proposed commit message (for the post-review commit):

```
refactor(product): hard-delete adoptions; drop deletedAt + version

product_org_adoptions is an org↔product membership link: un-adopt already
hard-purges every graft, no read sees a tombstone, and re-adopt always
inserts fresh. Drop the vestigial soft-delete (deletedAt) and optimistic-lock
(version) columns, swap the partial unique index for a plain one, and make
unadopt a true DELETE.
```

---

## Self-Review

**Spec coverage:**
- Schema drop `deletedAt`+`version`, plain unique index → Step 3 ✓
- Migration → Step 4 ✓
- `findLiveAdoption`→`findAdoption`, hard-delete `unadoptProduct`, `adoptProduct`/`isAdopted` callers → Step 5 ✓
- `queries.ts` adopted-products filter → Step 6 ✓
- Test edits (drop `deletedAt` assert + relational filters; keep regression cases; add "row gone" assertion) → Steps 1, 7 ✓
- No GraphQL schema change → confirmed (adoption is not a node/field; nothing in Steps touches `.graphql`/Pothos types) ✓
- Validation commands incl. `life check-types` and adoption e2e → Steps 7-8 ✓

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `findAdoption` used consistently in `adoptProduct`, `unadoptProduct`, `isAdopted`; `productOrgAdoptionsTable` is the existing in-service alias for the table; `unadoptProduct` return type stays `ProductOrgAdoption`. No signature drift.
