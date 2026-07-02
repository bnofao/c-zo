import { describe, expect, it } from 'vitest'
import { dedupeOneTierPerHierarchy, hierarchyOf } from './users-query'

const HIER = [
  { name: 'admin', tiers: [{ name: 'admin:viewer' }, { name: 'admin:manager' }, { name: 'admin' }] },
  { name: 'product', tiers: [{ name: 'product:viewer' }, { name: 'product:manager' }] },
]

describe('role helpers', () => {
  it('hierarchyOf splits on the first colon; bare role → itself', () => {
    expect(hierarchyOf('admin:manager')).toBe('admin')
    expect(hierarchyOf('admin')).toBe('admin')
    expect(hierarchyOf('product:viewer')).toBe('product')
  })
  it('keeps at most one tier per hierarchy (last selection wins)', () => {
    expect(dedupeOneTierPerHierarchy(['admin:viewer', 'admin:manager', 'product:viewer'], HIER))
      .toEqual(['admin:manager', 'product:viewer'])
  })
})
