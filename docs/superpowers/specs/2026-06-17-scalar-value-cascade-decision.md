# Cross-module cascade for scalar attribute values — decision record

**Date:** 2026-06-17
**Status:** Decided — no code change
**Area:** `@czo/product` ↔ `@czo/attribute` (assigned-attributes)

## Question

When an assignment is unassigned, or an org un-adopts a product (`purgeOrgAttributeGrafts`),
can a database `ON DELETE CASCADE` clean up the 1:1 scalar typed-value row, instead of the
type-derived manual delete the services do today?

This came up after dropping the `value_kind` column from `product_attribute_values` /
`variant_attribute_values`: the purge and unassign paths now derive a pivot's kind from
`attribute.type` (`valueKindForType`) and delete the matching scalar row by hand. The natural
question is whether the database could do that cleanup for us.

## Context

- `product_attribute_values.valueId` (and the variant equivalent) is a **polymorphic, FK-free
  cross-module reference**. It points into one of **nine** `@czo/attribute` value tables —
  `attributeValues`, `attributeSwatchValues`, `attributeReferenceValues`, `attributeNumericValues`,
  `attributeBooleanValues`, `attributeDateValues`, `attributeTextValues`, `attributeFileValues` —
  with the target table dictated by `attribute.type`.
- The **five true scalars** (`NUMERIC`, `BOOLEAN`, `DATE`, `TEXT`, `FILE`) are *minted 1:1* per
  assignment (`mintScalar` → `typedValueService.create*`), and deleted on unassign (`deleteScalar`).
- `SELECT` / `MULTISELECT` / `SWATCH` / `REFERENCE` reference **shared catalog rows**
  (`ensureCatalogValue`). They must never be deleted on unassign — they are shared across products.
- The five scalar tables are modeled as **attribute-module entities**: registered as GraphQL
  drizzle nodes (`AttributeNumericValue`, `AttributeBooleanValue`, `AttributeDateValue`,
  `AttributeFileValue`, `AttributeTextValue`), org-scoped, carrying `externalSource`/`externalId`
  sync metadata, and `attributeId … ON DELETE CASCADE` (an attribute owns its values).

## Why a plain FK cascade does not work

Three structural blockers, in order of finality:

1. **`valueId` is polymorphic.** It references nine different tables depending on `attribute.type`.
   A Postgres foreign key targets exactly one table — there is no multi-target / polymorphic FK.
   This is the same reason there is no FK on `valueId` today.
2. **The cascade direction is backwards.** `ON DELETE CASCADE` deletes the *referencing* (child)
   row when the *referenced* (parent) row is deleted. A `valueId → scalarValue` FK would therefore
   delete the **pivot when the scalar value is deleted** — the opposite of what the purge wants
   (delete the value when the pivot/adoption is removed).
3. **The link is cross-module by design.** `valueId` is deliberately FK-free so that `@czo/product`
   and `@czo/attribute` migrations stay independent. A real cascade requires an FK between the two
   tables, and these tables live in different modules.

## Options considered

### A. Inline scalars onto the pivot (rejected)
Move the scalar payload into typed columns on the pivot itself; the five scalar kinds stop being
separate rows. Deleting the pivot then drops the scalar **for free** (same row), and purge,
faceting, and the read path all simplify (no kind lookup, no dangling-ref guards, same-table facet
predicates).

Rejected because it dissolves the scalar tables as attribute-module entities and removes five
GraphQL nodes — a deliberate change of ownership and a breaking GraphQL change we do not want now.

### B. Per-kind FK columns + cascade (rejected)
Split the polymorphic `valueId` into typed nullable FK columns (`numericValueId → attributeNumericValues`,
etc.), each `ON DELETE CASCADE`. Delivers a real cascade and lets purge skip the `attribute.type`
lookup (the kind is implied by which column is set).

Rejected because it introduces **cross-module foreign keys** (product pivot → attribute tables),
which couples the two modules' migrations and forces every product integration test onto the
cross-module migration layer (the product-only layer cannot create attribute tables).

### C. DB trigger on pivot delete (rejected)
Keep `valueId` FK-free; add an `AFTER DELETE` trigger on the pivot that removes the matching scalar
row. Cascade-like cleanup without an FK.

Rejected because triggers are a new pattern in this codebase, and the trigger still needs the kind
(from `attribute.type` or a stored discriminator) — so it trades application code for harder-to-see
database code without removing the underlying lookup.

## Decision

**Keep the five scalar tables as attribute-module entities. Keep the type-derived purge. No
cross-module FK, no trigger, no cascade.**

Concretely, the current behavior stands:

- `unassignProductValue` / `unassignVariantValue` derive the kind from `attribute.type`
  (`valueKindForType`), delete the pivot, and — for non-select kinds — delete the scalar row via
  `deleteScalar`.
- `purgeOrgAttributeGrafts` eager-loads `with: { attribute: true }`, derives the kind per pivot,
  and deletes scalar grafts from the matching table; select-kind pivots reference shared catalog
  rows and are left untouched.

The modest extra read of `attribute.type` in these paths is the accepted cost of keeping the
product ↔ attribute boundary FK-free.

## Consequences

- No schema migration, no new code. This record exists to document *why* the cascade is not pursued
  so the question is not re-litigated.
- The `adoption.integration` suite must run on the cross-module test layer (it now reads the
  `attributes` table during purge) — already applied when `value_kind` was dropped.
- The cross-module `valueId` remains FK-free, so a hard-deleted attribute value can leave a dangling
  pivot reference; the read path (`groupAssigned`) already null-guards and omits dangling refs.

## Revisit if

- Scalar values stop being treated as attribute entities (no GraphQL nodes, no external sync) — then
  **Option A (inline)** becomes the obvious simplification and delivers the cascade for free.
- A cross-module FK between product and attribute is introduced for other reasons — then
  **Option B** becomes cheap to add on top.
