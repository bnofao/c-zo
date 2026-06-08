import { describe, expect, it } from 'vitest'
import { pickTranslation } from './translated-field'

const rows = [
  { localeCode: 'fr', name: 'Boutique', description: null },
  { localeCode: 'de', name: 'Laden', description: 'Hallo' },
]

describe('pickTranslation', () => {
  it('returns the translation for the requested locale', () => {
    expect(pickTranslation(rows, 'fr', 'name', 'Shop')).toBe('Boutique')
  })
  it('falls back to base when the locale is missing', () => {
    expect(pickTranslation(rows, 'es', 'name', 'Shop')).toBe('Shop')
  })
  it('falls back to base when locale is undefined', () => {
    expect(pickTranslation(rows, undefined, 'name', 'Shop')).toBe('Shop')
  })
  it('falls back to base when the translated column is null/empty', () => {
    expect(pickTranslation(rows, 'fr', 'description', 'base desc')).toBe('base desc')
    expect(pickTranslation(rows, 'de', 'description', 'base desc')).toBe('Hallo')
  })
})
