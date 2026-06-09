import { describe, expect, it } from 'vitest'
import { isDuplicateMatrix, variantSelectionKey } from './matrix'

describe('variantSelectionKey', () => {
  it('is order-independent: [{1,5},{2,9}] === [{2,9},{1,5}]', () => {
    const a = variantSelectionKey([{ attributeId: 1, valueId: 5 }, { attributeId: 2, valueId: 9 }])
    const b = variantSelectionKey([{ attributeId: 2, valueId: 9 }, { attributeId: 1, valueId: 5 }])
    expect(a).toBe(b)
  })

  it('empty selection → stable key; two empties are equal', () => {
    const k1 = variantSelectionKey([])
    const k2 = variantSelectionKey([])
    expect(k1).toBe(k2)
  })

  it('single pair key is well-formed', () => {
    const k = variantSelectionKey([{ attributeId: 3, valueId: 7 }])
    expect(k).toBe('3:7')
  })

  it('same attribute, different valueId → different keys', () => {
    const k1 = variantSelectionKey([{ attributeId: 1, valueId: 5 }])
    const k2 = variantSelectionKey([{ attributeId: 1, valueId: 6 }])
    expect(k1).not.toBe(k2)
  })
})

describe('isDuplicateMatrix', () => {
  it('isDuplicateMatrix([], any) → false', () => {
    expect(isDuplicateMatrix([], [{ attributeId: 1, valueId: 5 }])).toBe(false)
  })

  it('isDuplicateMatrix([[{1,5}]], [{1,5}]) → true', () => {
    expect(isDuplicateMatrix([[{ attributeId: 1, valueId: 5 }]], [{ attributeId: 1, valueId: 5 }])).toBe(true)
  })

  it('isDuplicateMatrix([[{1,5}]], [{1,6}]) → false', () => {
    expect(isDuplicateMatrix([[{ attributeId: 1, valueId: 5 }]], [{ attributeId: 1, valueId: 6 }])).toBe(false)
  })

  it('multiple existing combos: candidate equal to the 2nd of three → true', () => {
    const existing = [
      [{ attributeId: 1, valueId: 1 }],
      [{ attributeId: 1, valueId: 2 }],
      [{ attributeId: 1, valueId: 3 }],
    ]
    expect(isDuplicateMatrix(existing, [{ attributeId: 1, valueId: 2 }])).toBe(true)
  })

  it('order-independent match: existing [[{2,9},{1,5}]], candidate [{1,5},{2,9}] → true', () => {
    const existing = [[{ attributeId: 2, valueId: 9 }, { attributeId: 1, valueId: 5 }]]
    const candidate = [{ attributeId: 1, valueId: 5 }, { attributeId: 2, valueId: 9 }]
    expect(isDuplicateMatrix(existing, candidate)).toBe(true)
  })
})
