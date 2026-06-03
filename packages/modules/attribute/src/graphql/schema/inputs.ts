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
    fields: t => ({
      eq: t.field({ type: enums.AttributeType as any }),
      ne: t.field({ type: enums.AttributeType as any }),
      in: t.field({ type: [enums.AttributeType as any] }),
    }),
  })

  const AttributeUnitFilterRef = builder.inputRef<AttributeUnitFilter>('AttributeUnitFilterInput').implement({
    fields: t => ({
      eq: t.field({ type: enums.AttributeUnit as any }),
      ne: t.field({ type: enums.AttributeUnit as any }),
      in: t.field({ type: [enums.AttributeUnit as any] }),
    }),
  })

  // ── AttributeWhereInput ───────────────────────────────────────────────────

  const AttributeWhereInputRef = builder.inputRef<AttributeWhereInput>('AttributeWhereInput').implement({
    fields: t => ({
      name: t.field({ type: 'StringFilterInput' }),
      slug: t.field({ type: 'StringFilterInput' }),
      referenceEntity: t.field({ type: 'StringFilterInput' }),
      isRequired: t.field({ type: 'BooleanFilterInput' }),
      isFilterable: t.field({ type: 'BooleanFilterInput' }),
      type: t.field({ type: AttributeTypeFilterRef }),
      unit: t.field({ type: AttributeUnitFilterRef }),
      createdAt: t.field({ type: 'DateTimeFilterInput' }),
      updatedAt: t.field({ type: 'DateTimeFilterInput' }),
      AND: t.field({ type: [AttributeWhereInputRef] }),
      OR: t.field({ type: [AttributeWhereInputRef] }),
      NOT: t.field({ type: AttributeWhereInputRef }),
    }),
  })

  // ── AttributeOrderByInput ─────────────────────────────────────────────────
  // Local enums (same pattern as StockLocationOrderField/Direction) so the
  // schema build is self-contained and never depends on another module's
  // enum contribution running first.

  const AttributeOrderFieldRef = builder.enumType('AttributeOrderField', {
    values: {
      NAME: { value: 'name' },
      SLUG: { value: 'slug' },
      CREATED_AT: { value: 'createdAt' },
      UPDATED_AT: { value: 'updatedAt' },
    } as const,
  })

  const AttributeOrderDirectionRef = builder.enumType('AttributeOrderDirection', {
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('AttributeOrderByInput', {
    fields: t => ({
      field: t.field({ type: AttributeOrderFieldRef, required: true }),
      direction: t.field({ type: AttributeOrderDirectionRef, required: true }),
    }),
  })
}
