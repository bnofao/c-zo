import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DatabaseError } from '../../db/repository'
import { ErrorCode, toUserErrors } from './errors'

describe('toUserErrors', () => {
  it('should convert DatabaseError with fieldErrors to UNIQUE_CONSTRAINT', () => {
    const err = new DatabaseError('duplicate', { email: ['email \'foo@bar.com\' already exists'] })
    const errors = toUserErrors(err)

    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.UNIQUE_CONSTRAINT)
    expect(errors[0]!.field).toEqual(['email'])
    expect(errors[0]!.message).toContain('already exists')
  })

  it('should convert ZodError to VALIDATION_ERROR', () => {
    const schema = z.object({ name: z.string().min(1) })
    let zodErr: z.ZodError
    try {
      schema.parse({ name: '' })
    }
    catch (e) {
      zodErr = e as z.ZodError
    }

    const errors = toUserErrors(zodErr!)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]!.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(errors[0]!.field).toContain('name')
  })

  it('should convert Error with "not found" to NOT_FOUND', () => {
    const errors = toUserErrors(new Error('App not found'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.NOT_FOUND)
  })

  it('should convert Error with "forbidden" to FORBIDDEN', () => {
    const errors = toUserErrors(new Error('forbidden: no access'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('should convert Error with "permission" to FORBIDDEN', () => {
    const errors = toUserErrors(new Error('does not have the required permissions'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('should convert unknown errors to INTERNAL_ERROR', () => {
    const errors = toUserErrors(new Error('something weird'))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('should handle non-Error objects', () => {
    const errors = toUserErrors('string error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe(ErrorCode.INTERNAL_ERROR)
  })
})
