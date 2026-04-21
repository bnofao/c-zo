import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  ValidationError, NotFoundError, ConflictError,
  ForbiddenError, UnauthenticatedError, BaseGraphQLError,
} from './index'

describe('ValidationError', () => {
  it('carries fields and default message', () => {
    const err = new ValidationError([{ path: 'email', message: 'bad', code: 'invalid_string' }])
    expect(err).toBeInstanceOf(BaseGraphQLError)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.fields).toHaveLength(1)
    expect(err.fields[0].path).toBe('email')
    expect(err.message).toBe('Validation failed')
  })

  it('.fromZod flattens issues into FieldError[]', () => {
    const schema = z.object({ email: z.string().email(), name: z.string().min(2) })
    const parse = schema.safeParse({ email: 'bad', name: 'a' })
    expect(parse.success).toBe(false)
    if (parse.success) return
    const err = ValidationError.fromZod(parse.error)
    expect(err.fields.length).toBeGreaterThanOrEqual(2)
    expect(err.fields.some(f => f.path === 'email')).toBe(true)
    expect(err.fields.some(f => f.path === 'name')).toBe(true)
  })
})

describe('NotFoundError', () => {
  it('stores resource and id', () => {
    const err = new NotFoundError('User', 42)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.resource).toBe('User')
    expect(err.id).toBe(42)
    expect(err.message).toContain('User')
    expect(err.message).toContain('42')
  })
})

describe('ConflictError', () => {
  it('stores resource, conflictField, and allows custom message', () => {
    const err = new ConflictError('User', 'email', 'Email already in use')
    expect(err.code).toBe('CONFLICT')
    expect(err.resource).toBe('User')
    expect(err.conflictField).toBe('email')
    expect(err.message).toBe('Email already in use')
  })

  it('generates a default message', () => {
    const err = new ConflictError('User', 'email')
    expect(err.message).toContain('User')
    expect(err.message).toContain('email')
  })
})

describe('ForbiddenError', () => {
  it('carries requiredPermission', () => {
    const err = new ForbiddenError('user:create')
    expect(err.code).toBe('FORBIDDEN')
    expect(err.requiredPermission).toBe('user:create')
    expect(err.message).toContain('user:create')
  })
})

describe('UnauthenticatedError', () => {
  it('has default and custom message', () => {
    expect(new UnauthenticatedError().message).toBe('Authentication required')
    expect(new UnauthenticatedError('Session expired').message).toBe('Session expired')
    expect(new UnauthenticatedError().code).toBe('UNAUTHENTICATED')
  })
})
