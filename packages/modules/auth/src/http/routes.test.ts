import { buildOpenApiDocument } from '@czo/kit/openapi'
import { describe, expect, it } from 'vitest'
import { authRoutes } from './routes'

describe('authRoutes', () => {
  it('declares the three credential endpoints as POST', () => {
    expect(authRoutes.map(r => `${r.method} ${r.path}`)).toEqual([
      'post /api/auth/sign-up',
      'post /api/auth/sign-in',
      'post /api/auth/sign-out',
    ])
  })

  it('produces an OpenAPI document with the auth operations', () => {
    const doc = buildOpenApiDocument(authRoutes, { title: 'T', version: '1.0.0' })

    const signUp = doc.paths?.['/api/auth/sign-up']?.post
    expect(signUp?.summary).toBe('Sign up with email and password')
    expect(signUp?.tags).toEqual(['Auth'])
    const body = signUp?.requestBody
    const schema = body && 'content' in body ? body.content['application/json']?.schema : undefined
    expect(schema).toMatchObject({ required: ['email', 'name', 'password'] })
    expect(Object.keys(signUp?.responses ?? {})).toEqual(['200', '400', '403', '409'])

    expect(doc.paths?.['/api/auth/sign-in']?.post?.responses?.['401']).toBeDefined()
    expect(doc.paths?.['/api/auth/sign-out']?.post?.responses?.['204']).toBeDefined()
  })

  it('documents per-field `details` on the 400 response body', () => {
    const doc = buildOpenApiDocument(authRoutes, { title: 'T', version: '1.0.0' })

    const res = doc.paths?.['/api/auth/sign-up']?.post?.responses?.['400']
    const schema = res && 'content' in res ? res.content?.['application/json']?.schema : undefined
    expect(schema).toMatchObject({
      properties: {
        error: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
      },
    })

    // The plain error responses (e.g. 409) stay `{ error }` only — no `details`.
    const conflict = doc.paths?.['/api/auth/sign-up']?.post?.responses?.['409']
    const conflictSchema = conflict && 'content' in conflict
      ? conflict.content?.['application/json']?.schema
      : undefined
    expect((conflictSchema as { properties?: object })?.properties).not.toHaveProperty('details')
  })
})
