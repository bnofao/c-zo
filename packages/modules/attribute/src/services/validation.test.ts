import { describe, expect, it } from 'vitest'
import { validateHexColor, validateReferenceAttribute, validateSwatchVisual } from './validation'

describe('validateHexColor', () => {
  it('accepts #RRGGBB, rejects others', () => {
    expect(validateHexColor('#a1b2c3').ok).toBe(true)
    expect(validateHexColor('red').ok).toBe(false)
  })
})
describe('validateSwatchVisual', () => {
  it('requires color or file', () => {
    expect(validateSwatchVisual({ color: '#fff' }).ok).toBe(true)
    expect(validateSwatchVisual({ file: { url: 'https://x/y.png', mimetype: 'image/png' } }).ok).toBe(true)
    expect(validateSwatchVisual({}).ok).toBe(false)
  })
  it('requires mimetype when file present', () => {
    expect(validateSwatchVisual({ file: { url: 'https://x', mimetype: '' } }).ok).toBe(false)
  })
})
describe('validateReferenceAttribute', () => {
  it('requires referenceEntity only for the REFERENCE type', () => {
    expect(validateReferenceAttribute('REFERENCE', undefined).ok).toBe(false)
    expect(validateReferenceAttribute('REFERENCE', 'product').ok).toBe(true)
    expect(validateReferenceAttribute('DROPDOWN', undefined).ok).toBe(true)
  })
})
