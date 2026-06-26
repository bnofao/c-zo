import { describe, expect, it } from 'vitest'
import { GraphqlAdminError } from '../graphql/admin-error'
import { classifyError } from './classify-error'

describe('classifyError', () => {
  it('forbidden code → "forbidden"', () => {
    expect(classifyError(new GraphqlAdminError('[FORBIDDEN] x', undefined, 'FORBIDDEN'))).toBe('forbidden')
  })
  it('unauthenticated code → "unauthenticated"', () => {
    expect(classifyError({ code: 'UNAUTHENTICATED' })).toBe('unauthenticated')
  })
  it('anything else → "generic"', () => {
    expect(classifyError(new Error('boom'))).toBe('generic')
  })
})
