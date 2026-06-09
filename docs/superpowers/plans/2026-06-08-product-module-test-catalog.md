# @czo/product — Exhaustive Test Catalog

Companion to `2026-06-08-product-module.md`. Every case the implementation must
cover. Each implementation task's test step implements the cases for the file(s) it
touches; this catalog is the source of truth for "did we test everything".

**Legend:** **U** = pure unit (`vitest`, no DB). **I** = integration (Testcontainers
Postgres, `@effect/vitest`, `it.layer(ProductPostgresLayer)`). **E** = E2E
(`bootTestApp`, real GraphQL fetch). Assert Effect failures via `Effect.flip` then
`err._tag`. Optimistic-lock errors are plain `Error` → assert `.name ===
'OptimisticLockError'`. "merge predicate" = a row visible to org `X` iff
`org_id IS NULL OR org_id = X`.

**Cross-cutting conventions to test in EVERY soft-deletable entity (types, products,
variants, categories, collections, channel-listings, media, adoptions):**
- soft-deleted rows are excluded from `find*`/`list*`.
- the partial unique index lets you re-create the same natural key after soft-delete.
- `update*` with a stale `version` → `OptimisticLockError`; with the current
  `version` → succeeds and bumps `version`.

---

## 1. Pure unit

### 1.1 `matrix.ts` (U)
- `variantSelectionKey` is order-independent: `[{1,5},{2,9}]` == `[{2,9},{1,5}]`.
- `variantSelectionKey([])` → stable empty key (e.g. `''`); two empty selections equal.
- single-pair key well-formed (`'1:5'`).
- duplicate value on same attribute distinguished by valueId (`{1,5}` ≠ `{1,6}`).
- `isDuplicateMatrix([], any)` → false.
- `isDuplicateMatrix([[{1,5}]], [{1,5}])` → true; `…[{1,6}]` → false.
- multiple existing combos: candidate equal to the 2nd of three → true.
- order-independent match: existing `[{2,9},{1,5}]`, candidate `[{1,5},{2,9}]` → true.

### 1.2 `value-kind.ts` (U)
- `valueKindForType` for all 11 attribute types → exact kind (DROPDOWN/MULTISELECT→VALUE,
  SWATCH→SWATCH, REFERENCE→REFERENCE, PLAIN_TEXT/RICH_TEXT→TEXT, NUMERIC→NUMERIC,
  BOOLEAN→BOOLEAN, DATE/DATE_TIME→DATE, FILE→FILE).
- `isSelectType` true for {DROPDOWN, MULTISELECT, SWATCH, REFERENCE}; false for the
  other 7 (PLAIN_TEXT, RICH_TEXT, NUMERIC, BOOLEAN, DATE, DATE_TIME, FILE).

### 1.3 translatedField overlay (U — only if product re-tests `pickTranslation`; otherwise covered in E)
- locale present → returns the translated value.
- locale absent in the rows → returns the base value.
- translated value is empty string → returns the base value.
- translated value null → returns base.
- multiple translations → picks the one matching the requested locale.
- `locale` arg undefined → base.

---

## 2. Service integration (I)

### 2.1 `ProductTypeService`
**createType**
- creates a global type (`organizationId: null`) → row with `organizationId === null`.
- creates an org type (`organizationId: 1`).
- two scopes may reuse a slug: global `shirt` and org-1 `shirt` coexist.
- same scope duplicate live slug → DB unique violation surfaced as `ProductTypeDbFailed`
  (or a dedicated `TypeSlugTaken` if the plan adds one — assert whichever the service raises).
**updateType**
- updates name; bumps version.
- stale version → `OptimisticLockError` (`.name`).
- not found / soft-deleted → `ProductTypeNotFound`.
**softDeleteType**
- excluded from `findTypeById` (→ `ProductTypeNotFound`) and `listTypes`.
- re-create same slug after delete → OK.
**findTypeById / listTypes**
- `listTypes(1)` returns global ∪ org-1 types; excludes org-2 types.
- `listTypes(2)` excludes org-1 types but includes globals.
**declareAttribute**
- base declaration (`organizationId: null`) on a global type.
- org extension (`organizationId: 1`) on the same type.
- `variant_selection: true` with `assignment: 'VARIANT'` → OK.
- `variant_selection: true` with `assignment: 'PRODUCT'` → `InvalidAttributeDeclaration`
  (in-service guard; DB check is the backstop).
- duplicate `(productTypeId, organizationId, attributeId)` → DB unique violation → tagged db error.
- two different orgs may each declare the same `attributeId` as their own extension
  (org_id differs → unique holds).
**undeclareAttribute** removes the row; `listTypeAttributes` no longer returns it.
**listTypeAttributes**
- `{ productTypeId, orgId: 1 }` → base ∪ org-1 extensions.
- `{ productTypeId, orgId: 2 }` (non-extending) → base only.
- empty type → `[]`.

### 2.2 `ProductService`
**createProduct**
- org-owned product (`organizationId: 1`) on org-1 type → OK.
- global product (`organizationId: null`) on a global type → OK.
- global product on an org-owned type → `GlobalProductRequiresGlobalType`.
- org product referencing a global type → OK (globals are usable by all).
- org product referencing **another org's** type → rejected (type not visible →
  `ProductTypeNotFound`, since the lookup is scope-filtered).
- duplicate live handle in the same scope → `HandleTaken`.
- same handle across scopes (global vs org-1, or org-1 vs org-2) → OK.
**updateProduct** optimistic-lock conflict; not-found.
**softDeleteProduct** exclusion + handle re-use after delete.
**findProductByHandle({orgId, handle})** returns global or org-scoped; not-found path.
**listProducts(orgId)** merge predicate (global ∪ org).

### 2.3 `VariantService`
**createVariant**
- inherits `organizationId` from the parent product (global parent → null; org parent → org).
- two variants with **distinct** selections → both created.
- second variant with the **same** variant-selection combo → `DuplicateVariantMatrix`
  (wired in Task 10 step 7 once `variant_attribute_values` exists).
- `sku` uniqueness per org: duplicate live sku in same org → `SkuTaken`.
- multiple variants with `sku: null` in the same org → allowed (partial index excludes nulls).
- same sku across different orgs → allowed.
**updateVariant** optimistic-lock; not-found.
**softDeleteVariant** exclusion; sku re-use after delete.
**listVariants(productId)** returns live variants ordered by `position`.

### 2.4 `AdoptionService`
- `adoptProduct` on a global product → creates a live row; `isAdopted` → true.
- `adoptProduct` on an org-owned product → `CannotAdoptOwnedProduct`.
- `adoptProduct` on a non-existent / soft-deleted product → `ProductNotFound`.
- double `adoptProduct` (already adopted) → idempotent (no error, still one live row).
- `isAdopted` false for an org that never adopted; false for org-2 when only org-1 adopted.
- `unadoptProduct` → soft-deletes the adoption; `isAdopted` → false.
- re-adopt after unadopt → OK (partial unique excludes the soft-deleted row).
- `unadoptProduct` when not adopted → `AdoptionNotFound` (or no-op — assert the chosen behavior).
- `requireAdopted` succeeds when adopted; fails `ProductNotAdopted` when not.
- `listAdoptedProducts(orgId)` → only the org's live-adopted globals (not org-owned, not others').
- `listAdopters(productId)` → org ids with a live adoption; excludes unadopted.
- **cleanup (grow across phases):** after grafts exist, `unadoptProduct` deletes the
  org's `product_attribute_values`, `variant_attribute_values` (+ orphan scalar rows),
  `variant_price_sets`, `variant_inventory_items`, org-grafted `product_media`,
  `product_channel_listings` — and leaves base (`org_id NULL`) data + other orgs'
  grafts untouched. One assertion per graft family.

### 2.5 `AttributeAssignmentService`
**Adoption guard (run first)**
- org graft on a **global** product **without** adoption → `ProductNotAdopted`.
- same graft **after** adoption → succeeds.
- graft on an **org-owned** product → no adoption needed.
- base write (`organizationId: null`) on a global product → no adoption needed.
**Type-gating**
- assign an attribute **not** declared on the product's type → `AttributeNotAssignedToType`.
- assign an attribute declared only as an **org extension** of org-1: allowed for
  org-1 graft, rejected (`AttributeNotAssignedToType`) for org-2.
- assign a **PRODUCT**-level attribute via `assignVariantValue` (wrong level) → rejected.
- assign a **VARIANT**-level attribute via `assignProductValue` → rejected.
**Select-types**
- DROPDOWN: pivot references the catalog `valueId`, `valueKind='VALUE'`.
- MULTISELECT with `value: [id1, id2]` → two pivot rows.
- SWATCH / REFERENCE → correct `valueKind`, references the right catalog table.
- referencing a `valueId` that doesn't belong to the attribute → `ValueKindMismatch`
  (or a not-found — assert chosen error).
- unassign a select graft → pivot row gone, **catalog row still present**.
**Scalar-types**
- NUMERIC assign `42` → mints `attribute_numeric_values` row + pivot `valueKind='NUMERIC'`.
- BOOLEAN / TEXT (plain+rich) / DATE / FILE → mints the matching typed row.
- unassign a scalar graft → **both** the pivot and the minted typed row deleted.
- changing a scalar value → old typed row deleted, new one minted (no orphan leak).
**Overlay reads**
- base assignment (`org null`) + org-1 graft coexist; `listProductValues({productId, orgId:1})`
  → both; `orgId:2` → base only.
- variant equivalents for all of the above (`assignVariantValue`/`listVariantValues`).

### 2.6 `PriceBindingService`
- `bindPriceSet` creates the `(variant, org)` row.
- second `bindPriceSet` for the same `(variant, org)` → replaces (upsert), one row remains.
- bind referencing a price set owned by **another org** → `CrossOrgGraftDenied`.
- adoption guard: bind on a global variant without adoption → `ProductNotAdopted`; after adopt → OK.
- `listVariantPriceSets({variantId, orgId})` → the org's binding only.
- unbind removes the row.

### 2.7 `InventoryBindingService`
- `linkInventoryItem` creates the `(variant, org, item)` row with `requiredQuantity`.
- `requiredQuantity <= 0` → rejected (DB check + in-service guard).
- duplicate `(variant, org, item)` → rejected / idempotent (assert chosen behavior).
- link referencing an inventory item owned by another org → `CrossOrgGraftDenied`.
- adoption guard on a global variant.
- M:N: two different items linked to the same variant for the same org → both rows.
- `unlinkInventoryItem` removes one link, leaves the other.
- `listVariantInventoryItems({variantId, orgId})` → the org's links only.

### 2.8 `CategoryService`
- create global category, create org category; slug uniqueness per scope.
- `setParent(child, parent)` sets the tree edge; `listCategories` merge predicate.
- **cycle:** `setParent(node, node)` (self) → `CategoryCycle`.
- **cycle:** `setParent(ancestor, descendant)` (transitive) → `CategoryCycle`.
- valid re-parent (no cycle) → OK.
- place a product in a category: base placement (`org null`) and org-1 graft.
- `listProductCategories({productId, orgId})` merge (base ∪ org-1).
- remove a placement; soft-delete a category (exclusion + slug re-use).
- placing a product in a soft-deleted category → rejected (`CategoryNotFound`).

### 2.9 `CollectionService`
- org-scoped create (no global); slug uniqueness per org.
- add a product to a collection; duplicate add → idempotent/rejected (assert).
- remove a product; `listCollectionProducts`.
- list an org's collections; org-2 cannot see org-1 collections.
- soft-delete (exclusion + slug re-use).

### 2.10 `ChannelListingService`
- `publish` creates a listing (is_published, visible_in_listings, dates).
- second `publish` same `(product, channel)` → updates (or `ChannelListingExists` if a
  separate create — assert the chosen semantics; the plan's `publish` upserts, and the
  `ChannelListingExists` case is the explicit "create duplicate active" guard if exposed).
- channel owned by **another org** → `CrossOrgGraftDenied`.
- adoption guard: publishing a global product without adoption → `ProductNotAdopted`.
- `unpublish` soft-deletes the listing; re-publish after → OK.
- `listListings(productId)`.

### 2.11 `MediaService`
- `addMedia` base (`org null`) and org-1 graft; `mediaType` IMAGE/VIDEO.
- adoption guard on org media for a global product.
- `removeMedia`.
- `linkVariantMedia` / `unlinkVariantMedia` (M:N); link to media of a different product
  → rejected (`MediaNotFound` / validation).
- `listProductMedia({productId, orgId})` merge (base ∪ org-1).

### 2.12 Translations (I — service or folded-in upserts)
- upsert a `product_translations` row; unique `(product_id, locale_code)` → second upsert
  for the same locale updates, doesn't duplicate.
- same for category/collection/variant pivots.
- translation referencing an unknown `locale_code` is allowed at the DB level (no FK) —
  the service may validate against `@czo/translation` locales; assert chosen behavior.

---

## 3. GraphQL + E2E (E)

### 3.1 Storefront reads (public)
- `product(handle, channelId)` returns a product that has a live listing with
  `is_published = true && visible_in_listings = true` and `available_for_purchase_at`
  null-or-past for that channel.
- not published on that channel → not returned.
- `visible_in_listings = false` → excluded from `products` listing but resolvable by
  direct `product(handle)` (assert the chosen visibility semantics).
- `available_for_purchase_at` in the future → not purchasable/returned (assert).
- localized fields: with a `product_translations` row for `fr`, querying `locale: 'fr'`
  returns the translated name; `locale: 'de'` (absent) → base name; empty translation → base.
- merge predicate on graft fields: as org A, `Product.attributeValues` shows base ∪ A;
  as org B, base only.

### 3.2 node(id:) guards
- global product node → readable by any authenticated viewer's org (loader returns null →
  grant). 
- org-owned product node → readable by the owner org; **org C (no access) → `node` resolves
  to `null`** (deny-as-null, no leak).
- the same for ProductVariant, ProductType, Category, Collection, ProductMedia nodes.

### 3.3 Mutations — global vs org authz
- `createGlobalProduct` / `createGlobalProductType` / `createGlobalCategory` with a user
  holding the **global** `product` role → OK.
- same mutations with a user holding only an **org** `product` role → permission error.
- org mutation (`createProduct` with `organizationId: 1`) by an org-1 member with the
  `product` permission → OK; by a non-member → permission error.
- org graft mutation where `args.input.organizationId` ≠ the acting org → denied.
- optimistic lock surfaced through GraphQL (update with stale version → error payload).
- each mutation's declared `errors.types` actually routes the tagged error (e.g.
  `HandleTaken`, `DuplicateVariantMatrix`, `CategoryCycle`, `GlobalProductRequiresGlobalType`,
  `ProductNotAdopted`, `CrossOrgGraftDenied`, `CannotAdoptOwnedProduct`) as a typed result.

### 3.4 Adoption lifecycle (E)
- `adoptProduct` (org create perm) → `Product.isAdopted` true for that org, false for others.
- `adoptedProducts` lists the org's adopted globals only.
- graft mutation (bind price / assign attribute / publish) **before** adopt → `ProductNotAdopted`;
  **after** adopt → success.
- `unadoptProduct` (org delete perm) → grafts removed (price/attribute/listing/media/inventory),
  base + other orgs' grafts intact; `isAdopted` false; `adoptedProducts` no longer lists it.
- `adoptProduct` on an org-owned product via GraphQL → `CannotAdoptOwnedProduct`.

### 3.5 Org-owned full flow (E — Task 22)
Create org type → declare a variant-selection DROPDOWN attribute → create product →
create 2 variants with distinct selections (3rd duplicate → `DuplicateVariantMatrix`) →
assign a product attribute → bind a price set → link an inventory item → create a channel
+ publish → storefront `product(handle, channelId)` returns localized + merged graft data;
unpublished channel → not returned.

### 3.6 Global + two-org isolation (E — Task 23)
Admin creates global type + base attributes (incl. variant-selection) + global product +
variants. Org A adopts, extends the type with an org attribute, grafts a product attribute,
binds price, links inventory, publishes on A's channel. Assert:
- adoption gate (graft before adopt fails; after adopt succeeds).
- storefront for A's channel → base ∪ A grafts; for B's channel → product not visible.
- product node as org B → base attributes only (no A grafts).
- `unadoptProduct` by A purges A's grafts; base intact; org B unaffected throughout.
- DENIAL: org A (no global role) editing the global base → permission error; org C reading
  an A-graft node → null.

### 3.7 Relay / pagination (E)
- `products` / `categories` / `collections` connections paginate (first/after), expose
  `pageInfo`, and return stable global IDs; a `relatedConnection` (e.g.
  `Product.variants`) respects the parent-aware authz + merge predicate.

---

## 4. Coverage acceptance

A phase is "test-complete" when every case in its sections is implemented and green:
- Phase 1 → §1.1, §1.2, §2.1, §2.2, §2.3 (matrix case skipped until 2.5 wiring), §2.4.
- Phase 2 → §2.5 (+ unskip §2.3 duplicate-matrix), §2.4 cleanup (attributes).
- Phase 3 → §2.6, §2.7, §2.4 cleanup (price/inventory).
- Phase 4 → §2.8, §2.9.
- Phase 5 → §2.10, §2.11, §2.4 cleanup (media/listings).
- Phase 6 → §2.12, §1.3.
- Phase 7 → §3.1–§3.7.
