# @czo/product — Module Design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation plan
**Branch (to cut from):** `main` @ `a0a9d49a`

## Goal

A scalable, extensible **product catalog** module — the hub that ties together the
existing modules: `@czo/attribute` (typed characteristics + variant options),
`@czo/price` (per-variant price sets), `@czo/inventory` (stock), `@czo/channel`
(sales channels), and `@czo/translation` (localized content).

It follows the **Saleor model** as inspiration — not replication. Two guiding
principles:

1. **The attribute is the single brick** for every typed, filterable, translatable
   characteristic; variant "options" are simply attributes flagged
   `variant_selection`. This avoids Medusa's parallel `ProductOption/OptionValue`
   system and reuses `@czo/attribute`'s existing typed-value engine.
2. **Global products + per-org overlay.** A platform admin creates **global**
   products (one canonical product for the whole platform). Organizations **graft**
   org-scoped data onto them (price, extra attributes, inventory backing, media,
   category placement) without ever mutating the canonical product. This reuses
   c-zo's existing global/org pattern (`organizationId` nullable, as in
   `@czo/attribute`).

## Scope

**Full catalog, with product types, and global products.** A single coherent
domain, one spec, built in phases (see Build Phases). In scope: global & org-owned
product types, products, variants (with a variant matrix), attribute assignment
(product- and variant-level, with org type-extensions), classification (categories
+ collections), per-channel publication, media, and translations for
product/category/collection/variant.

**Out of scope (this sprint):** promotions/discounts, tax classes, product reviews,
bundle *stock-resolution* math (the M:N inventory link is in scope; computing
bundle availability is deferred), import/export, search indexing, secondary/primary
category flagging, tags (covered by a MULTISELECT attribute — see Decisions),
copy-on-adopt of global products (rejected — see Decisions).

## Global Products & The Overlay Model

The defining concept. Every entity in the module falls into one of two layers:

**Definition layer — `organizationId` is NULLABLE (global vs org-owned):**
- `null` ⇒ **global**: created/edited by a platform admin via a **global**
  `product` permission (no `organization` — same gate as global locales/attributes).
  Readable by all orgs. Holds the canonical data.
- non-null ⇒ **org-owned**: behaves like a private product, invisible to other orgs.

Definition entities: `product_types`, `product_type_attributes` (org-extendable —
see below), `products`, `product_variants`, `categories`. **`collections` are
always org-scoped** (merchandising is per-org; no global collections).

A **global product** references a **global product_type** (which declares **global
attributes**). A global product's **variants are canonical** — defined by the
admin; the matrix is shared platform-wide. An org **does not add variants** to a
global product (that would change the matrix for everyone); it only grafts onto the
existing variants.

**Graft layer — rows carry `org_id` to scope per-org additions onto a global
definition.** For an org-owned product these rows carry the owner's `org_id`. For a
global product, the **base** rows (admin-created) carry `org_id = NULL` and each
org's grafts carry that org's id.

| Graft | Table & mechanism |
|---|---|
| Price | `variant_price_sets(variant_id, org_id, price_set_id)` unique(variant_id, org_id) — price binding lives here, **not** on the variant. Uniform for org-owned (org_id = owner) and global (org_id = grafting org). |
| Inventory | `variant_inventory_items(variant_id, org_id, inventory_item_id, required_quantity)` — stock is intrinsically per-org; a global variant has no stock of its own, each org backs it with its own items. |
| Attributes | `product_attribute_values` / `variant_attribute_values` carry `org_id` (NULL = base of a global product; set = an org's graft). |
| Media | `product_media.org_id` nullable (NULL = base media; set = an org's added media). |
| Category placement | `product_categories.org_id` nullable (NULL = base placement; set = an org's own placement). |
| Channel publication | `product_channel_listings` — already org-scoped (channels belong to orgs). Unchanged. |

**Adoption (explicit).** An org **adopts** a global product before grafting onto it.
`product_org_adoptions(product_id, org_id)` is the single source of truth: *adopted
= the row exists*. This gives a clean catalog query (an org's catalog = its
org-owned products ∪ the global products it has adopted), a lifecycle
(adopt/unadopt), and a guard — **grafting on a global product requires an
adoption** (org-owned products need none; ownership is intrinsic). Unadopting
removes the org's grafts and soft-deletes the adoption.

**Read rule (merge):** resolving a global product for org X returns base rows
(`org_id IS NULL`) **∪** X's grafts (`org_id = X`). For an org-owned product viewed
by its owner, every row has `org_id = owner`, so the same predicate
(`org_id IS NULL OR org_id = X`) works uniformly.

**Org type-extension:** `product_type_attributes` carries `org_id` nullable. Base
declarations (`org_id IS NULL`) belong to a global type; an org **extends** a
(global or its own) type with org-scoped extra attribute declarations
(`org_id = X`). Every assigned attribute value — base or graft — validates against
the type's effective attribute set for that org (base ∪ org extensions). This keeps
the Saleor "the type declares the attributes" invariant while letting orgs add more.

## Architecture

Effect-native module via `defineModule`, mirroring `@czo/price` / `@czo/inventory`:

- **Service + impl colocated** per file under `src/services/<name>.ts`: the
  `Context.Service` Tag, tagged errors (`Data.TaggedError`, registered as Pothos
  GraphQL errors via `registerError`), input/output types, the `make`
  `Effect.gen` factory, and the exported `Layer.effect(Tag, make)`.
- **Runtime DB** via `@effect/sql-pg` (`effect-postgres`), Drizzle RQBv2 object
  form (`db.query.table.findFirst({ where: { id } })`).
- **Org-scoped throughout**, with the global/org duality above. Reads take an
  explicit `orgId` (the viewer's org) and apply the merge predicate
  (`org_id IS NULL OR org_id = :orgId`). Never session-derived org.
- **Cross-module references** are plain `integer` columns with **no inter-module
  DB FK** (the established convention: `organizationId`, `stockLocationId`,
  `price_set_id`, `channel_id`, `attribute_id`, `inventory_item_id`, `locale_code`).
  Ownership/integrity is enforced in the service layer. **Intra-module** relations
  use real FKs with `onDelete`.
- **Soft-delete** via `deletedAt`; **optimistic locking** via `version`
  (`optimisticUpdate({ db, table, id, expectedVersion, values })`).
- `SchemaRegistryShape` augmented inline in `schema.ts`.
- **Config** tunables (if any) go in the module's `Config` block, threaded via
  `cfg.value`.

## Data Model

Standard columns unless noted: `id` (identity), `metadata jsonb?`, `deletedAt?`,
`version`, `createdAt`, `updatedAt`. `organizationId` nullability is called out per
table. Intra-module FKs use `onDelete: 'cascade'` unless stated. Cross-module refs
are FK-less by convention. "Merge predicate" = `org_id IS NULL OR org_id = :orgId`.

### Type & product (definition layer — org_id nullable)

```text
product_types
  id, org_id NULLABLE, name, slug, is_shipping_required bool default true, metadata, soft/version/audit
  index(org_id); unique(org_id, slug) WHERE deleted_at IS NULL
  -- slug uniqueness is per-scope: two orgs (or an org and global) may reuse a slug;
  --   NULLS treated distinct is fine since global slugs are admin-curated.

product_type_attributes        -- ProductType ↔ Attribute association; org-extendable
  id, product_type_id FK→product_types cascade,
  org_id NULLABLE,                 -- NULL = base (global) declaration; set = an org's extension
  attribute_id (cross-module ref, no FK),
  assignment enum('PRODUCT','VARIANT') not null,
  variant_selection bool not null default false,   -- true ⇒ differentiates variants (the matrix)
  position int not null default 0
  unique(product_type_id, org_id, attribute_id);
  check: variant_selection = true ⇒ assignment = 'VARIANT'
  -- variant_selection declarations should be base (org extensions add PRODUCT/VARIANT
  --   data attrs but must NOT change a global product's canonical matrix) — enforced in service.

products
  id, org_id NULLABLE, product_type_id (intra-module FK→product_types restrict),
  handle, name, description?, thumbnail_url?, metadata, soft/version/audit
  index(org_id); unique(org_id, handle) WHERE deleted_at IS NULL; index(product_type_id)
  -- service invariant: a global product (org_id NULL) MUST reference a global type (org_id NULL).
  --   an org-owned product may reference a global type OR its own type.
```

> `products.product_type_id` is an **intra-module** FK → real FK,
> `onDelete: 'restrict'` (can't delete a type that still has products).

### Variants & matrix (definition layer — org_id nullable)

A product always has **≥1 variant** (the sellable unit). The matrix is defined by
the values of the product type's `variant_selection` attributes — **no** separate
options table. A global product's variants are admin-managed and canonical.

```text
product_variants
  id, org_id NULLABLE (mirrors the parent product), product_id FK→products cascade,
  sku? (merchandising identity), position int default 0, metadata, soft/version/audit
  index(product_id); unique(org_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL
  -- NO price_set_id here (moved to variant_price_sets); NO inventory ref (variant_inventory_items).
```

> **Variant SKU vs inventory SKU:** the variant carries its *own* optional `sku`
> (merchandising identity), distinct from inventory-item SKUs (a variant may bundle
> multiple items, each with its own fulfilment SKU).

### Adoption (membership — global products only)

```text
product_org_adoptions
  id, product_id FK→products cascade, org_id not null,
  adopted_at timestamptz not null default now(), deletedAt?, version, createdAt, updatedAt
  unique(product_id, org_id) WHERE deleted_at IS NULL
  index(org_id)
```

The single source of truth for "org X uses global product P": *adopted = a live row
exists*. Only **global** products are adopted (an org-owned product is intrinsically
owned — adopting one is rejected). An org's catalog = `products WHERE org_id = X`
**∪** global products with a live adoption for X. **Grafting (price, inventory,
attributes, media, channel listing) on a global product requires a live
adoption** — enforced in every graft service. Unadopting soft-deletes the adoption
and removes the org's grafts on that product.

### Attribute assignment — "everything references" (graft layer — org_id)

Every assigned value lives in `@czo/attribute`; the pivots carry only a
**polymorphic reference**. `@czo/attribute` has 8 typed value tables, so a single
FK is impossible — the pivot stores `(attribute_id, value_kind, value_id)` with
**no DB FK**.

```text
value_kind enum: 'VALUE' | 'SWATCH' | 'REFERENCE' | 'TEXT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' | 'FILE'
  -- derived from attribute.type; names which @czo/attribute value table value_id points to:
  --   DROPDOWN/MULTISELECT → VALUE (attribute_values)         REFERENCE → REFERENCE (attribute_reference_values)
  --   SWATCH    → SWATCH    (attribute_swatch_values)         PLAIN_TEXT/RICH_TEXT → TEXT (attribute_text_values)
  --   NUMERIC   → NUMERIC   (attribute_numeric_values)        BOOLEAN   → BOOLEAN   (attribute_boolean_values)
  --   DATE/DATE_TIME → DATE (attribute_date_values)           FILE      → FILE      (attribute_file_values)

product_attribute_values
  id, product_id FK→products cascade,
  org_id NULLABLE,                 -- NULL = base attribute of a global product; set = an org's graft
  attribute_id (cross-module), value_kind, value_id (cross-module), position int default 0
  index(product_id); index(product_id, org_id, attribute_id)

variant_attribute_values
  id, variant_id FK→product_variants cascade,
  org_id NULLABLE,                 -- NULL = base; set = org graft
  attribute_id (cross-module), value_kind, value_id (cross-module), position int default 0
  index(variant_id); index(variant_id, org_id, attribute_id)
```

**Service rules (AttributeAssignmentService):**
- The attribute MUST be declared on the product's `product_type` for the viewing
  org — i.e. present in `product_type_attributes` as a base row (`org_id IS NULL`)
  **or** an extension owned by the grafting org (`org_id = X`) — at the matching
  `assignment` level. Reject otherwise (`AttributeNotAssignedToType`).
- **Select-types** (DROPDOWN/MULTISELECT/SWATCH/REFERENCE): the value is a row in
  the **shared catalog**; the pivot references the chosen `value_id`. On unassign,
  the catalog row is **never** deleted (shared). MULTISELECT ⇒ multiple pivot rows.
- **Scalar-types** (TEXT/NUMERIC/BOOLEAN/DATE/FILE): the value is per-entity. On
  assign, the service **creates** a row in the appropriate `@czo/attribute` typed
  table via the attribute module's `TypedValueService`, then links it. On unassign
  (or value change), the service **deletes** the now-orphan scalar row.
- `value_kind` is derived from `attribute.type` — validated for consistency, never
  trusted blindly from the client.
- **Graft governance:** a base attribute value (`org_id IS NULL`) may be written
  only via the global `product` permission. An org graft (`org_id = X`) requires
  the org `product` permission and that X is the viewing org.

> **Coupling:** `AttributeAssignmentService` depends on `@czo/attribute`'s
> `TypedValueService` (already exists) to mint/delete scalar value rows.

### Cross-module graft links (graft layer — org_id)

```text
variant_price_sets             -- price binding (replaces price_set_id on variant)
  id, variant_id FK→product_variants cascade,
  org_id not null,             -- always an org (price is inherently org-scoped); for org-owned products = owner
  price_set_id (cross-module ref to @czo/price, no FK)
  unique(variant_id, org_id); index(price_set_id)

variant_inventory_items        -- M:N, supports bundles/kits; per-org stock backing
  id, variant_id FK→product_variants cascade,
  org_id not null,             -- which org's inventory backs this variant
  inventory_item_id (cross-module ref, no FK),
  required_quantity int not null default 1 check(> 0)
  unique(variant_id, org_id, inventory_item_id); index(variant_id, org_id)
```

> `org_id` is `not null` on these two: price and stock have no "global base" — they
> are always supplied by an org. Service validates the referenced `price_set_id` /
> `inventory_item_id` belongs to that org.

### Classification

```text
categories                     -- definition layer (org_id nullable: global taxonomy + org categories), tree
  id, org_id NULLABLE, parent_id? FK→categories cascade, name, description?, slug, position int default 0, soft/version/audit
  index(org_id); index(parent_id); unique(org_id, slug) WHERE deleted_at IS NULL
product_categories             -- M:N placement (graft layer: org_id nullable)
  id, product_id FK→products cascade, category_id FK→categories cascade,
  org_id NULLABLE              -- NULL = base placement; set = an org's own placement
  unique(product_id, category_id, org_id); index(category_id)

collections                    -- ALWAYS org-scoped (merchandising)
  id, org_id not null, name, description?, slug, soft/version/audit
  index(org_id); unique(org_id, slug) WHERE deleted_at IS NULL
collection_products            -- M:N (org-scoped via collection.org_id)
  id, collection_id FK→collections cascade, product_id FK→products cascade
  unique(collection_id, product_id); index(product_id)
```

> **Tags dropped** — lightweight labels are a MULTISELECT attribute (typed,
> filterable, translatable). A tags table would duplicate the attribute system.
>
> **Category cardinality:** M:N (no canonical primary branch); a future
> `is_primary` flag on `product_categories` can disambiguate without remodeling.

### Per-channel publication (graft layer — org-scoped via channel)

Price stays in `@czo/price`. The listing carries **publication/visibility only** —
no price, no global product status. Channels belong to orgs, so a listing is
inherently the org's overlay (and serves as the de-facto "this org sells this
product").

```text
product_channel_listings
  id, product_id FK→products cascade,
  channel_id (cross-module ref to @czo/channel, no FK),
  is_published bool not null default false,
  visible_in_listings bool not null default true,
  available_for_purchase_at timestamptz?,
  published_at timestamptz?,
  soft/version/audit
  unique(product_id, channel_id) WHERE deleted_at IS NULL; index(channel_id)
```

A product with **zero** channel listings is unpublished everywhere (the "draft"
state, Saleor-style — no global status enum).

### Media (graft layer — org_id nullable on product_media)

```text
product_media
  id, product_id FK→products cascade,
  org_id NULLABLE,             -- NULL = base media; set = an org's added media
  url, alt?, type enum('IMAGE','VIDEO') default 'IMAGE', position int default 0, soft/version/audit
  index(product_id)
variant_media                  -- M:N: each variant highlights a subset of media
  id, variant_id FK→product_variants cascade, media_id FK→product_media cascade
  unique(variant_id, media_id); index(media_id)
```

### Translations (consumer pivots, translatedField helper)

Four entities. `locale_code` is a cross-module ref to `@czo/translation`'s
`locales` (no FK). Each pivot: `unique(<entity>_id, locale_code)`. Translations of a
**global** product's base fields are admin-managed (global permission); an org does
not translate the canonical product (it would graft via its own fields if needed —
out of scope this sprint).

```text
product_translations(id, product_id FK cascade, locale_code, name, description?)
category_translations(id, category_id FK cascade, locale_code, name, description?)
collection_translations(id, collection_id FK cascade, locale_code, name, description?)
variant_translations(id, variant_id FK cascade, locale_code, name)
```

GraphQL exposes localized fields via the `translatedField` helper
(`extensions.pothosDrizzleSelect` batched overlay, fallback to the base column).

## Services

Small, single-responsibility files (200–400 lines). Each enforces the global/org
gate (global writes ⇒ global permission; org writes/grafts ⇒ org permission + org
match) and the merge predicate on reads.

- **ProductTypeService** — CRUD product types (global or org); declare/undeclare
  `product_type_attributes` (base = global perm; org extension = org perm); guards
  that `variant_selection` is only set on base declarations.
- **ProductService** — CRUD products; invariant: global product ⇒ global type;
  handle uniqueness per scope.
- **VariantService** — CRUD variants (admin-only on global products); **matrix
  validation**: the set of `variant_selection` attribute values is unique among a
  product's variants; a variant's variant-attributes must all be variant_selection
  attributes of the product's type.
- **AdoptionService** — `adoptProduct({ productId, orgId })` (rejects if the product
  is org-owned → `CannotAdoptOwnedProduct`; idempotent re-adopt after unadopt),
  `unadoptProduct` (soft-delete adoption + remove the org's grafts on that product),
  `isAdopted({ productId, orgId })`, `listAdoptedProducts(orgId)`, `listAdopters(productId)`.
- **AttributeAssignmentService** — "everything references" + scalar value lifecycle
  (depends on `@czo/attribute` TypedValueService); validates attribute is declared
  on the type for the org (base ∪ org extension) at the right level; base vs graft
  gating.

> **Adoption guard (cross-cutting):** every graft service (AttributeAssignment,
> PriceBinding, InventoryBinding, Media, ChannelListing), before writing an org
> graft (`org_id = X`) onto a **global** product, calls
> `AdoptionService.isAdopted({ productId, orgId: X })` and rejects with
> `ProductNotAdopted` if absent. Grafts on org-owned products and admin writes on a
> global product's base (`org_id = NULL`) skip this check.
- **CategoryService** — tree CRUD (cycle prevention), product↔category placement
  (base or org graft).
- **CollectionService** — org-scoped CRUD + product↔collection links.
- **ChannelListingService** — publish/unpublish per channel, visibility,
  availability dates (validates channel belongs to the org).
- **MediaService** — product media CRUD (base or org graft) + variant↔media links.
- **PriceBindingService** / **InventoryBindingService** — manage
  `variant_price_sets` / `variant_inventory_items` grafts (validate the referenced
  price_set / inventory_item belongs to the org).

## GraphQL

Pothos, `drizzleNode` (`select:true`) + relay. Nodes: **Product, ProductVariant,
ProductType, Category, Collection, ProductMedia**.

- Resolving a product/variant for the viewing org applies the merge predicate so
  the response shows base ∪ org grafts (e.g. `Product.attributeValues`,
  `Variant.priceSet`, `Variant.inventoryItems`, `Product.media`,
  `Product.categories`).
- Localized fields via `translatedField`.
- Mutations: relay `relayMutationField` CRUD. **Global** product/type/category
  mutations gated by a **global** `product` permission
  (`{ permission: { resource:'product', actions } }`, no `organization`). **Org**
  mutations (org-owned entities + all grafts) gated by the **org** scope
  (`{ permission: { resource:'product', actions, organization } }`). Tagged errors
  declared on `errors.types`.
- **Adoption:** `adoptProduct` / `unadoptProduct` mutations (org scope);
  `adoptedProducts` query (the org's adopted globals); `Product.isAdopted` boolean
  field resolved against the viewer org.
- Storefront reads (products/categories/collections by handle/slug) are **public**
  but org-scoped (merge predicate) and filtered by `product_channel_listings`
  (is_published / visible_in_listings / availability) for the requested channel.
- Node-guards registered in the kit registry (gate `node(id:)`; deny-as-null);
  global rows readable by any authenticated viewer's org via the merge predicate,
  org-owned rows gated to the owner.

## Authorization

Access domain `product:viewer/manager/admin` (cumulative hierarchy: viewer={read},
manager={read,create,update}, admin={+delete}), registered via the module's access
domain in `index.ts`.

- **Global entities** (product/type/category with `org_id IS NULL`): create/update/
  delete require the **global** `product` permission (the user's global role —
  no `organization`), same gate as global locales/attributes.
- **Org-owned entities & all grafts**: require the **org** `product` permission for
  the acting org (`{ permission: { resource:'product', actions, organization } }`),
  and the graft's `org_id` must equal the acting org.
- **Adoption**: `adoptProduct` requires the org `product` `create` action;
  `unadoptProduct` the org `product` `delete` action (both org-scoped to the acting
  org).
- **Reads**: public storefront resolution respects channel publication; admin reads
  use the merge predicate.

## Error Handling

Tagged errors (`Data.TaggedError`), registered as Pothos errors and declared on
mutation `errors.types`: `ProductNotFound`, `ProductTypeNotFound`, `HandleTaken`,
`SkuTaken`, `DuplicateVariantMatrix`, `AttributeNotAssignedToType`,
`ValueKindMismatch`, `CategoryCycle`, `ChannelListingExists`,
`GlobalProductRequiresGlobalType`, `CrossOrgGraftDenied`, `ProductNotAdopted`,
`CannotAdoptOwnedProduct`, `ProductDbFailed`.
`OptimisticLockError` (plain Error, assert `.name`) on version conflicts.
Cross-module ownership violations → domain NotFound (deny-as-not-found, no
cross-tenant leak — same pattern as price's C1 fix).

## Testing

- **Unit:** matrix-uniqueness, `value_kind` derivation, category cycle detection,
  scalar-vs-select classification, merge-predicate logic, global-type invariant.
- **Integration (Testcontainers Postgres):** each service against a real DB via
  `makePostgresTestLayer` / `truncateTables`; soft-delete exclusion,
  optimistic-lock conflicts, M:N links, scalar value lifecycle, org-scoping
  (cross-org graft rejection), **global product + two orgs grafting independently**
  (org A's price/attributes invisible to org B; base visible to both).
- **E2E (`bootTestApp`):** two flows —
  1. *Org-owned:* create org type → product → variants → assign attrs → bind
     price/inventory → publish → localized storefront read filtered by channel.
  2. *Global + graft:* admin creates global type + global product + variants; org A
     extends the type, grafts attributes + price + inventory, publishes on its
     channel; storefront read for org A shows base ∪ A grafts; org B sees only
     base. Permission DENIAL (org can't edit the global base; non-member blocked);
     node-guard org-scoping (deny-as-null).

Coverage target: at least the bar held by auth/price (a module this size will land
higher given the overlay surface).

## Decisions Log

1. **Saleor over Medusa for the variant model** — attribute = single brick;
   variant options = attributes flagged `variant_selection`. Reuses
   `@czo/attribute`; no redundant ProductOption tables.
2. **Always ≥1 variant** — uniform sellable-unit model.
3. **Global products via overlay** (org_id nullable + org-scoped grafts), **not
   copy-on-adopt** — keeps one canonical product for the platform (the user's
   explicit "produits uniques"), reuses the existing global/org pattern; global
   updates are seen by all orgs; no N-copies drift.
4. **Price binding moved off the variant** to `variant_price_sets(variant, org)` —
   price is inherently org-scoped, and a global variant needs N org prices; one
   uniform path for both product kinds.
5. **Inventory link carries org_id** — stock is per-org; a global variant has no
   intrinsic stock, each org backs it with its own items.
6. **"Everything references" attribute assignment** — single source of truth for
   values → uniform faceted search. Cost: polymorphic value ref + scalar lifecycle,
   handled in service.
7. **Org type-extension** (`product_type_attributes.org_id`) — orgs add attributes
   to a (global) type via org-scoped declarations; keeps the "type declares
   attributes" invariant while allowing "ajouter plus d'attributs".
8. **Category M:N + Collection M:N (org-only), drop tags** — chosen flexibility;
   tags subsumed by a MULTISELECT attribute.
9. **Per-channel listing = visibility only; no global status** — separates
   publication from pricing; Saleor-style "draft = no listing".
10. **Variant own optional `sku`** — merchandising identity distinct from inventory
    SKUs (a variant may bundle multiple items).
11. **`is_shipping_required` on product_type**; **matrix uniqueness in service** (no
    DB constraint).
12. **Explicit adoption** (`product_org_adoptions`) over implicit/derived — the
    pure-overlay model made "has org X adopted product P?" an ambiguous multi-table
    scan with no lifecycle. A thin membership table gives one source of truth, a
    clean catalog query, an adopt/unadopt lifecycle, and a graft guard (graft on a
    global ⇒ requires adoption). Org-owned products need no adoption.

## Build Phases (for the implementation plan)

1. **Foundations & globality** — `product_types` (+org extensions), `products`,
   `product_variants` with `org_id` nullable + global/org gating + merge predicate;
   matrix validation; **`product_org_adoptions` + AdoptionService**; migrations;
   services; tests. (Later graft phases call `AdoptionService.isAdopted` as a guard.)
2. **Attribute assignment** — "everything references" + scalar lifecycle + org
   graft governance (`AttributeAssignmentService`).
3. **Cross-module graft links** — `variant_price_sets` + `variant_inventory_items`
   (org-scoped) + org-ownership validation.
4. **Classification** — categories (tree, global+org) + collections (org-only) +
   placement pivots (org graft).
5. **Publication & media** — `product_channel_listings` + `product_media`
   (org graft) / `variant_media`.
6. **Translations** — 4 pivot tables + `translatedField` wiring.
7. **GraphQL surface** — nodes, connections (merge predicate), mutations,
   global+org authz scopes, node-guards, both E2E flows.
