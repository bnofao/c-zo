import type { SchemaIssue } from 'effect'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { EmailAlreadyRegistered, InvalidCredentials } from './credential'
import { errorResponseBody, httpStatusForError, InvalidRequestBody } from './error-map'

// Build a real `SchemaIssue` the way the HTTP handler does: a failed decode.
// The sync decoder throws a plain `Error` whose `cause` is the issue tree.
function bodyIssue(input: unknown): SchemaIssue.Issue {
  const S = Schema.Struct({
    email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/)),
    name: Schema.String.check(Schema.isMinLength(1)),
  })
  try {
    Schema.decodeUnknownSync(S)(input, { errors: 'all' })
    throw new Error('expected decode to fail')
  }
  catch (e) {
    return (e as { cause: SchemaIssue.Issue }).cause
  }
}

describe('httpStatusForError', () => {
  it('maps EmailAlreadyRegistered → 409', () => {
    expect(httpStatusForError(new EmailAlreadyRegistered({ email: 'a@b.c' }))).toBe(409)
  })
  it('maps InvalidCredentials → 401', () => {
    expect(httpStatusForError(new InvalidCredentials())).toBe(401)
  })
  it('maps InvalidRequestBody → 400', () => {
    expect(httpStatusForError(new InvalidRequestBody({ issue: bodyIssue({}) }))).toBe(400)
  })
  it('maps an unknown error → 500', () => {
    expect(httpStatusForError(new Error('boom'))).toBe(500)
  })
})

describe('errorResponseBody', () => {
  it('returns only the code for a domain error', () => {
    expect(errorResponseBody(new InvalidCredentials())).toEqual({ error: 'INVALID_CREDENTIALS' })
    expect(errorResponseBody(new EmailAlreadyRegistered({ email: 'a@b.c' })))
      .toEqual({ error: 'EMAIL_ALREADY_REGISTERED' })
  })

  it('never leaks the cause of a generic/internal error', () => {
    expect(errorResponseBody(new Error('connection to 10.0.0.1 with secret dsn failed')))
      .toEqual({ error: 'ERROR' })
  })

  it('includes per-field details for an invalid body', () => {
    const body = errorResponseBody(new InvalidRequestBody({ issue: bodyIssue({ email: 'nope' }) }))
    expect(body.error).toBe('INVALID_REQUEST_BODY')
    expect(body.details).toEqual([
      { path: ['email'], message: expect.stringContaining('RegExp') },
      { path: ['name'], message: 'Missing key' },
    ])
  })
})
