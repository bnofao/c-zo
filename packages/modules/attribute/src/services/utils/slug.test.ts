import { describe, expect, it } from 'vitest'
import { generateSlug } from './slug'

describe('generateSlug', () => {
  it('lowercases, trims, replaces non-alphanumerics with hyphens', () => {
    expect(generateSlug('Crimson Red!')).toBe('crimson-red')
    expect(generateSlug('  Hello  World  ')).toBe('hello-world')
  })
  it('collapses repeats and strips leading/trailing hyphens', () => {
    expect(generateSlug('--A__B--')).toBe('a-b')
  })
})
