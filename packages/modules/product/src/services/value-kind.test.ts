import { describe, expect, it } from 'vitest'
import { isSelectType, valueKindForType } from './value-kind'

describe('valueKindForType', () => {
  it('dROPDOWN → VALUE', () => {
    expect(valueKindForType('DROPDOWN')).toBe('VALUE')
  })
  it('mULTISELECT → VALUE', () => {
    expect(valueKindForType('MULTISELECT')).toBe('VALUE')
  })
  it('sWATCH → SWATCH', () => {
    expect(valueKindForType('SWATCH')).toBe('SWATCH')
  })
  it('rEFERENCE → REFERENCE', () => {
    expect(valueKindForType('REFERENCE')).toBe('REFERENCE')
  })
  it('pLAIN_TEXT → TEXT', () => {
    expect(valueKindForType('PLAIN_TEXT')).toBe('TEXT')
  })
  it('rICH_TEXT → TEXT', () => {
    expect(valueKindForType('RICH_TEXT')).toBe('TEXT')
  })
  it('nUMERIC → NUMERIC', () => {
    expect(valueKindForType('NUMERIC')).toBe('NUMERIC')
  })
  it('bOOLEAN → BOOLEAN', () => {
    expect(valueKindForType('BOOLEAN')).toBe('BOOLEAN')
  })
  it('dATE → DATE', () => {
    expect(valueKindForType('DATE')).toBe('DATE')
  })
  it('dATE_TIME → DATE', () => {
    expect(valueKindForType('DATE_TIME')).toBe('DATE')
  })
  it('fILE → FILE', () => {
    expect(valueKindForType('FILE')).toBe('FILE')
  })
})

describe('isSelectType', () => {
  it.each(['DROPDOWN', 'MULTISELECT', 'SWATCH', 'REFERENCE'] as const)(
    '%s is a select type',
    (type) => { expect(isSelectType(type)).toBe(true) },
  )

  it.each(['PLAIN_TEXT', 'RICH_TEXT', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATE_TIME', 'FILE'] as const)(
    '%s is not a select type',
    (type) => { expect(isSelectType(type)).toBe(false) },
  )
})
