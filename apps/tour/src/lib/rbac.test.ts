import { describe, expect, it } from 'vitest'
import { can } from './rbac'

const admin = { permissions: [{ resource: 'user', actions: ['read', 'list'] }, { resource: 'session', actions: ['read'] }] }
const plain = { permissions: [] }

describe('can', () => {
  it('grants when the resource bucket includes the action', () => {
    expect(can(admin, 'user', 'read')).toBe(true)
  })

  it('denies when the action is absent from the bucket', () => {
    expect(can(admin, 'user', 'delete')).toBe(false)
  })

  it('denies when the resource bucket is absent', () => {
    expect(can(admin, 'product', 'read')).toBe(false)
    expect(can(plain, 'user', 'read')).toBe(false)
  })

  it('denies for a null/undefined viewer', () => {
    expect(can(null, 'user', 'read')).toBe(false)
    expect(can(undefined, 'user', 'read')).toBe(false)
  })
})
