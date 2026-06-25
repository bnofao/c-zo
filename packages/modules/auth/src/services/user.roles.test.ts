import { describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { assertDefaultUserRolesValid, mergeRoles, parseCsvRoles } from './user'

describe('parseCsvRoles', () => {
  it('empty string → []', () => {
    expect(parseCsvRoles('')).toEqual([])
  })
  it('single role', () => {
    expect(parseCsvRoles('admin')).toEqual(['admin'])
  })
  it('trims and drops empties', () => {
    expect(parseCsvRoles('a, b ,')).toEqual(['a', 'b'])
  })
})

describe('mergeRoles', () => {
  it('provided first, then defaults', () => {
    expect(mergeRoles(['admin'], ['m', 'v'])).toEqual(['admin', 'm', 'v'])
  })
  it('dedupes overlap', () => {
    expect(mergeRoles(['m'], ['m'])).toEqual(['m'])
  })
  it('defaults only when nothing provided', () => {
    expect(mergeRoles([], ['x'])).toEqual(['x'])
  })
  it('empty when both empty', () => {
    expect(mergeRoles([], [])).toEqual([])
  })
})

describe('assertDefaultUserRolesValid', () => {
  it.effect('passes when every role is registered', () =>
    assertDefaultUserRolesValid(['x'], { x: {}, y: {} }))

  it.effect('fails InvalidDefaultUserRoles listing the unknown roles', () =>
    assertDefaultUserRolesValid(['x', 'z'], { x: {} }).pipe(
      Effect.flip,
      Effect.tap(e => Effect.sync(() => {
        expect(e._tag).toBe('InvalidDefaultUserRoles')
        expect(e.roles).toEqual(['z'])
      })),
    ))
})
