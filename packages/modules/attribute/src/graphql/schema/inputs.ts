// Attribute module — Pothos input types for filtering and ordering.
//
// `AttributeWhereInput`   — reuses kit filter inputs (StringFilter, BooleanFilter,
//                           DateTimeFilter) plus local enum-filter inputs for
//                           AttributeType and AttributeUnit.
// `AttributeOrderByInput` — orders by a local `AttributeOrderField` enum +
//                           a local `AttributeOrderDirection` enum.
//
// `AttributeChoiceWhereInput` is omitted: `Attribute.values` is resolved
// in-memory (relay cursor over full table load). Add in Task 10 if needed.

import type { AttributeWhereInput } from '@czo/attribute/graphql'
import type { AttributeGraphQLSchemaBuilder } from '..'
import type { attributeTypeEnum, attributeUnitEnum } from '../../database/schema'
import { attributeEnumRefs } from './enums'

// ── Enum value literal types (for TypeScript) ─────────────────────────────
// Derived from the Drizzle enum arrays so they never drift.
export type AttributeType = (typeof attributeTypeEnum.enumValues)[number]
export type AttributeUnit = (typeof attributeUnitEnum.enumValues)[number]

export interface AttributeTypeFilter {
  eq?: AttributeType | null
  ne?: AttributeType | null
  in?: AttributeType[] | null
}

export interface AttributeUnitFilter {
  eq?: AttributeUnit | null
  ne?: AttributeUnit | null
  in?: AttributeUnit[] | null
}

export function registerAttributeInputs(builder: AttributeGraphQLSchemaBuilder): void {
  const enums = attributeEnumRefs()

  // ── Local enum filter inputs ──────────────────────────────────────────────
  // The enum refs returned by `builder.enumType` carry Pothos's internal
  // `ValuesFromEnum<BaseEnum>` (~string) type, which doesn't satisfy the
  // literal union in the `inputRef<T>` generic. We use `as any` on the field
  // type refs inside `.implement()` — the outer `inputRef<AttributeTypeFilter>`
  // already declares the correct TypeScript shape for callers.

  const AttributeTypeFilterRef = builder.inputRef<AttributeTypeFilter>('AttributeTypeFilterInput').implement({
    description: 'Filter attributes by their type (AttributeType enum).',
    fields: t => ({
      eq: t.field({ type: enums.AttributeType as any, description: 'Match attributes whose type equals this value.' }),
      ne: t.field({ type: enums.AttributeType as any, description: 'Match attributes whose type differs from this value.' }),
      in: t.field({ type: [enums.AttributeType as any], description: 'Match attributes whose type is any of these values.' }),
    }),
  })

  const AttributeUnitFilterRef = builder.inputRef<AttributeUnitFilter>('AttributeUnitFilterInput').implement({
    description: 'Filter attributes by their unit (AttributeUnit enum).',
    fields: t => ({
      eq: t.field({ type: enums.AttributeUnit as any, description: 'Match attributes whose unit equals this value.' }),
      ne: t.field({ type: enums.AttributeUnit as any, description: 'Match attributes whose unit differs from this value.' }),
      in: t.field({ type: [enums.AttributeUnit as any], description: 'Match attributes whose unit is any of these values.' }),
    }),
  })

  // ── AttributeWhereInput ───────────────────────────────────────────────────

  const AttributeWhereInputRef = builder.inputRef<AttributeWhereInput>('AttributeWhereInput').implement({
    description: 'Filter predicate for the `attributes` connection. Field filters are AND-combined; use the AND/OR/NOT members to compose arbitrary boolean trees.',
    fields: t => ({
      name: t.field({ type: 'StringFilterInput', description: 'Filter by attribute name.' }),
      slug: t.field({ type: 'StringFilterInput', description: 'Filter by attribute slug.' }),
      referenceEntity: t.field({ type: 'StringFilterInput', description: 'Filter by the referenced entity name (REFERENCE attributes).' }),
      isRequired: t.field({ type: 'BooleanFilterInput', description: 'Filter by the isRequired flag.' }),
      isFilterable: t.field({ type: 'BooleanFilterInput', description: 'Filter by the isFilterable flag.' }),
      type: t.field({ type: AttributeTypeFilterRef, description: 'Filter by attribute type.' }),
      unit: t.field({ type: AttributeUnitFilterRef, description: 'Filter by attribute unit.' }),
      createdAt: t.field({ type: 'DateTimeFilterInput', description: 'Filter by creation timestamp.' }),
      updatedAt: t.field({ type: 'DateTimeFilterInput', description: 'Filter by last-update timestamp.' }),
      AND: t.field({ type: [AttributeWhereInputRef], description: 'All sub-predicates must match.' }),
      OR: t.field({ type: [AttributeWhereInputRef], description: 'At least one sub-predicate must match.' }),
      NOT: t.field({ type: AttributeWhereInputRef, description: 'The sub-predicate must not match.' }),
    }),
  })

  // ── AttributeOrderByInput ─────────────────────────────────────────────────
  // Local enums (same pattern as StockLocationOrderField/Direction) so the
  // schema build is self-contained and never depends on another module's
  // enum contribution running first.

  const AttributeOrderFieldRef = builder.enumType('AttributeOrderField', {
    description: 'A field the `attributes` connection can be ordered by.',
    values: {
      NAME: { value: 'name' },
      SLUG: { value: 'slug' },
      CREATED_AT: { value: 'createdAt' },
      UPDATED_AT: { value: 'updatedAt' },
    } as const,
  })

  const AttributeOrderDirectionRef = builder.enumType('AttributeOrderDirection', {
    description: 'Sort direction: ascending or descending.',
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('AttributeOrderByInput', {
    description: 'One ordering clause for the `attributes` connection (field + direction). Multiple clauses are applied in order.',
    fields: t => ({
      field: t.field({ type: AttributeOrderFieldRef, required: true, description: 'The attribute field to sort by.' }),
      direction: t.field({ type: AttributeOrderDirectionRef, required: true, description: 'Ascending or descending.' }),
    }),
  })
}
