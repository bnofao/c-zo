import { describe, expect, it } from 'vitest'
import { distDirURL, filterInPlace, MODE_RE, toArray } from './utils'

describe('toArray', () => {
  it('should wrap a single value in an array', () => {
    expect(toArray('hello')).toEqual(['hello'])
  })

  it('should return an array as-is', () => {
    const arr = [1, 2, 3]
    expect(toArray(arr)).toBe(arr)
  })

  it('should return an empty array as-is', () => {
    const arr: string[] = []
    expect(toArray(arr)).toBe(arr)
    expect(toArray(arr)).toEqual([])
  })

  it('should wrap falsy values', () => {
    expect(toArray(0)).toEqual([0])
    expect(toArray(null)).toEqual([null])
    expect(toArray(false)).toEqual([false])
  })
})

describe('filterInPlace', () => {
  it('should keep items matching the predicate', () => {
    const arr = [1, 2, 3, 4, 5]
    filterInPlace(arr, n => n > 2)
    expect(arr).toEqual([3, 4, 5])
  })

  it('should remove items not matching the predicate', () => {
    const arr = ['a', 'bb', 'ccc', 'd']
    filterInPlace(arr, s => s.length === 1)
    expect(arr).toEqual(['a', 'd'])
  })

  it('should return the same array reference (mutate in place)', () => {
    const arr = [1, 2, 3]
    const result = filterInPlace(arr, n => n !== 2)
    expect(result).toBe(arr)
  })

  it('should handle an empty array', () => {
    const arr: number[] = []
    filterInPlace(arr, () => true)
    expect(arr).toEqual([])
  })

  it('should pass index and array to predicate', () => {
    const indices: number[] = []
    const arr = [10, 20, 30]
    filterInPlace(arr, (_item, index, a) => {
      indices.push(index)
      expect(a).toBe(arr)
      return true
    })
    // Iterates from end to start
    expect(indices).toEqual([2, 1, 0])
  })
})

describe('mode regex (MODE_RE)', () => {
  it('should match .server.ts', () => {
    expect(MODE_RE.test('plugin.server.ts')).toBe(true)
  })

  it('should match .client.ts', () => {
    expect(MODE_RE.test('plugin.client.ts')).toBe(true)
  })

  it('should match .server with extra extensions', () => {
    expect(MODE_RE.test('plugin.server.dev.ts')).toBe(true)
  })

  it('should not match regular filenames', () => {
    expect(MODE_RE.test('plugin.ts')).toBe(false)
    expect(MODE_RE.test('server.ts')).toBe(false)
    expect(MODE_RE.test('plugin.test.ts')).toBe(false)
  })
})

describe('distDirURL', () => {
  it('should be a URL instance', () => {
    expect(distDirURL).toBeInstanceOf(URL)
  })
})
