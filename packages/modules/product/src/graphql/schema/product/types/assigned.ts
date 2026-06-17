// Pure helper backing the typed `assignedAttributes` reads.
//
// It takes the loaded `productAttributeValues` rows (each with its cross-module
// value relation populated), applies the base∪org tenancy filter, groups by
// `attributeId`, and maps each group into the `AttributeAssignment` model that
// `@czo/attribute` owns and exposes via `@czo/attribute/graphql`.

import type { AnyAssignment } from '@czo/attribute/graphql'
import type {
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributeReferenceValues,
  attributes,
  attributeSwatchValues,
  attributeTextValues,
  attributeValues,
} from '@czo/attribute/schema'
import type { productAttributeValues, variantAttributeValues } from '../../../../database/schema'
import type { AttributeType, ValueKind } from '../../../../services/value-kind'
import { valueKindForType } from '../../../../services/value-kind'

// The value relations a grouped assignment reads. `productAttributeValues` and
// `variantAttributeValues` are column-identical and carry the same cross-module
// value relations, so both row shapes share this overlay.
interface AssignedValueRelations {
  attribute: typeof attributes.$inferSelect
  selectValue?: typeof attributeValues.$inferSelect | null
  swatchValue?: typeof attributeSwatchValues.$inferSelect | null
  referenceValue?: typeof attributeReferenceValues.$inferSelect | null
  numericValue?: typeof attributeNumericValues.$inferSelect | null
  booleanValue?: typeof attributeBooleanValues.$inferSelect | null
  dateValue?: typeof attributeDateValues.$inferSelect | null
  textValue?: typeof attributeTextValues.$inferSelect | null
  fileValue?: typeof attributeFileValues.$inferSelect | null
}

export type PavRow = typeof productAttributeValues.$inferSelect & AssignedValueRelations
export type VavRow = typeof variantAttributeValues.$inferSelect & AssignedValueRelations

// Returns the union of concrete `AttributeAssignment` subtypes (`AnyAssignment`) —
// each element is one of `@czo/attribute`'s `DropdownAssignment | NumericAssignment
// | …`, assignable to the `AssignedAttribute` interface backing the Pothos reads.
export function groupAssigned(rows: ReadonlyArray<PavRow | VavRow>, org: number | null): AnyAssignment[] {
  // Group by attribute; the value relation to read is derived from the
  // attribute's own `type` (no `valueKind` column on the pivot). The output
  // members carry no kind — the GraphQL concrete type is likewise resolved from
  // the attribute's `type` (see @czo/attribute `isTypeOf`).
  const groups = new Map<number, { kind: ValueKind, attribute: PavRow['attribute'], rows: Array<PavRow | VavRow> }>()
  for (const r of rows) {
    if (!(r.organizationId == null || r.organizationId === org))
      continue
    let g = groups.get(r.attributeId)
    if (g == null) {
      g = { kind: valueKindForType(r.attribute.type as AttributeType), attribute: r.attribute, rows: [] }
      groups.set(r.attributeId, g)
    }
    g.rows.push(r)
  }
  // `valueId` is a cross-module ref with NO FK (attribute values are hard-deleted
  // with no graft cleanup), so a value relation can be null (dangling ref). Every
  // branch null-guards and OMITS the assignment rather than asserting — a dangling
  // ref must never NPE a public read. `flatMap([])` drops the omitted groups.
  return [...groups.values()]
    .sort((a, b) => a.attribute.slug.localeCompare(b.attribute.slug))
    .flatMap((g): AnyAssignment[] => {
      const sorted = [...g.rows].sort((a, b) => a.position - b.position)
      const attribute = g.attribute
      const first = sorted[0]
      switch (g.kind) {
        case 'VALUE': {
          const selectValues = sorted.map(r => r.selectValue).filter((v): v is NonNullable<typeof v> => v != null)
          return selectValues.length ? [{ attribute, selectValues }] : []
        }
        case 'SWATCH': {
          const swatchValues = sorted.map(r => r.swatchValue).filter((v): v is NonNullable<typeof v> => v != null)
          return swatchValues.length ? [{ attribute, swatchValues }] : []
        }
        case 'REFERENCE': {
          const referenceValues = sorted.map(r => r.referenceValue).filter((v): v is NonNullable<typeof v> => v != null)
          return referenceValues.length ? [{ attribute, referenceValues }] : []
        }
        case 'NUMERIC': return first?.numericValue ? [{ attribute, numeric: first.numericValue.value }] : []
        case 'BOOLEAN': return first?.booleanValue ? [{ attribute, boolean: first.booleanValue.value }] : []
        case 'DATE': return first?.dateValue ? [{ attribute, date: first.dateValue.value }] : []
        case 'TEXT': return first?.textValue ? [{ attribute, text: { plain: first.textValue.plain, rich: first.textValue.rich } }] : []
        case 'FILE': return first?.fileValue ? [{ attribute, file: { fileUrl: first.fileValue.fileUrl, mimetype: first.fileValue.mimetype } }] : []
        default: return []
      }
    })
}
