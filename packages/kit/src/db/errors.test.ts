import { describe, expect, it } from 'vitest'
import { DatabaseError, OptimisticLockError, toDatabaseError } from './errors'

describe('databaseError', () => {
  it('has a name and message', () => {
    const err = new DatabaseError('some message')
    expect(err.name).toBe('DatabaseError')
    expect(err.message).toBe('some message')
    expect(err.fieldErrors).toBeUndefined()
  })

  it('carries fieldErrors when provided', () => {
    const err = new DatabaseError('failed', { email: ['must be unique'] })
    expect(err.fieldErrors).toEqual({ email: ['must be unique'] })
  })
})

describe('optimisticLockError', () => {
  it('includes entityId, expectedVersion, actualVersion', () => {
    const err = new OptimisticLockError(42, 3, 4)
    expect(err.entityId).toBe(42)
    expect(err.expectedVersion).toBe(3)
    expect(err.actualVersion).toBe(4)
    expect(err.name).toBe('OptimisticLockError')
    expect(err.message).toContain('version 3')
    expect(err.message).toContain('version 4')
  })

  it('describes deleted record when actualVersion is null', () => {
    const err = new OptimisticLockError(42, 3, null)
    expect(err.message).toContain('deleted record')
  })
})

describe('toDatabaseError', () => {
  it('rethrows DatabaseError as-is', () => {
    const original = new DatabaseError('orig')
    expect(() => toDatabaseError(original)).toThrow(original)
  })

  it('maps pg unique_violation (code 23505) with detail', () => {
    const pgErr = Object.assign(new Error('dup'), {
      code: '23505',
      detail: 'Key (email)=(x@y.z) already exists.',
    })
    try {
      toDatabaseError(pgErr)
      throw new Error('should have thrown')
    }
    catch (err) {
      expect(err).toBeInstanceOf(DatabaseError)
      expect((err as DatabaseError).fieldErrors).toEqual({ email: ['must be unique'] })
    }
  })

  it('maps pg foreign_key_violation (code 23503)', () => {
    const pgErr = Object.assign(new Error('fk'), { code: '23503' })
    expect(() => toDatabaseError(pgErr)).toThrow(DatabaseError)
  })

  it('rethrows unknown errors', () => {
    const unk = new Error('unknown')
    expect(() => toDatabaseError(unk)).toThrow(unk)
  })
})
