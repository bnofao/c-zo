import { describe, expect, it } from 'vitest'
import { EmailAlreadyRegistered, InvalidCredentials } from './credential'
import { httpStatusForError, InvalidRequestBody } from './error-map'

describe('httpStatusForError', () => {
  it('maps EmailAlreadyRegistered → 409', () => {
    expect(httpStatusForError(new EmailAlreadyRegistered({ email: 'a@b.c' }))).toBe(409)
  })
  it('maps InvalidCredentials → 401', () => {
    expect(httpStatusForError(new InvalidCredentials())).toBe(401)
  })
  it('maps InvalidRequestBody → 400', () => {
    expect(httpStatusForError(new InvalidRequestBody({ cause: new Error('bad body') }))).toBe(400)
  })
  it('maps an unknown error → 500', () => {
    expect(httpStatusForError(new Error('boom'))).toBe(500)
  })
})
