import { describe, expect, it } from 'vitest'
import { groupAssigned } from './assigned-field'

// `groupAssigned` derives the kind from the attribute's `type` (no `valueKind`
// column), so each row's attribute carries a representative type for its kind.
const TYPE_FOR_KIND: Record<string, string> = { VALUE: 'DROPDOWN', SWATCH: 'SWATCH', REFERENCE: 'REFERENCE', TEXT: 'PLAIN_TEXT', NUMERIC: 'NUMERIC', BOOLEAN: 'BOOLEAN', DATE: 'DATE', FILE: 'FILE' }
function row(attributeId: number, kind: string, organizationId: number | null, position: number, extra: Record<string, unknown>) {
  return { attributeId, organizationId, position, attribute: { id: attributeId, slug: `attr-${attributeId}`, type: TYPE_FOR_KIND[kind] }, ...extra } as any
}

describe('groupAssigned', () => {
  it('filters base∪org, groups by attribute, sorts groups by slug and values by position', () => {
    const out = groupAssigned([
      row(2, 'NUMERIC', 7, 0, { numericValue: { value: 42 } }),
      row(1, 'VALUE', null, 1, { selectValue: { slug: 'b' } }),
      row(1, 'VALUE', 7, 0, { selectValue: { slug: 'a' } }),
      row(3, 'VALUE', 9, 0, { selectValue: { slug: 'x' } }), // org 9 — excluded when viewing as org 7
    ], 7)
    expect(out.map(g => g.attribute.slug)).toEqual(['attr-1', 'attr-2']) // attr-3 (org9) excluded; sorted by slug
    expect((out[0] as any).selectValues.map((v: any) => v.slug)).toEqual(['a', 'b']) // VALUE member, base∪org7, position-sorted
    expect((out[1] as any).numeric).toBe(42) // NUMERIC member
  })
  it('org null → base rows only', () => {
    const out = groupAssigned([row(1, 'VALUE', null, 0, { selectValue: { slug: 'base' } }), row(1, 'VALUE', 7, 0, { selectValue: { slug: 'org' } })], null)
    expect((out[0] as any).selectValues.map((v: any) => v.slug)).toEqual(['base'])
  })
  it('maps each kind to its bucket', () => {
    const mk = (kind: string, extra: Record<string, unknown>): any => groupAssigned([row(1, kind, null, 0, extra)], null)[0]
    expect(mk('BOOLEAN', { booleanValue: { value: true } }).boolean).toBe(true)
    expect(mk('TEXT', { textValue: { plain: 'hi', rich: null } }).text).toEqual({ plain: 'hi', rich: null })
    expect(mk('FILE', { fileValue: { fileUrl: 'u', mimetype: 'm' } }).file).toEqual({ fileUrl: 'u', mimetype: 'm' })
    expect(mk('SWATCH', { swatchValue: { slug: 's' } }).swatchValues!.map((v: any) => v.slug)).toEqual(['s'])
    expect(mk('REFERENCE', { referenceValue: { referenceId: 5 } }).referenceValues![0]!.referenceId).toBe(5)
    expect(mk('DATE', { dateValue: { value: new Date('2024-01-01') } }).date).toEqual(new Date('2024-01-01'))
  })
  it('omits (does not throw) a group whose value relation is a dangling cross-module ref', () => {
    // valueId has no FK; the attribute value can be hard-deleted out from under us.
    expect(groupAssigned([row(1, 'NUMERIC', null, 0, { numericValue: null })], null)).toEqual([])
    expect(groupAssigned([row(1, 'TEXT', null, 0, {})], null)).toEqual([])
    expect(groupAssigned([row(1, 'VALUE', null, 0, { selectValue: null })], null)).toEqual([])
    // a surviving value in a mixed set still resolves
    const out = groupAssigned([row(1, 'NUMERIC', null, 0, { numericValue: null }), row(2, 'NUMERIC', null, 0, { numericValue: { value: 9 } })], null)
    expect(out.map(g => g.attribute.slug)).toEqual(['attr-2'])
    expect((out[0] as any).numeric).toBe(9)
  })
})
