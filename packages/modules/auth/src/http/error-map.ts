import { Data } from 'effect'

/**
 * Tagged error for a request body that fails `Schema` decoding. `Schema`'s sync
 * decoder throws a plain `Error` (no `_tag`), so the HTTP handlers wrap that
 * throw in this tagged error — which `httpStatusForError` then maps to 400.
 */
export class InvalidRequestBody extends Data.TaggedError('InvalidRequestBody')<{
  readonly cause: unknown
}> {
  readonly code = 'INVALID_REQUEST_BODY'
  get message() { return 'Request body is invalid' }
}

/** Map a tagged error (or anything) to an HTTP status for the auth handlers. */
const STATUS_BY_TAG: Record<string, number> = {
  EmailAlreadyRegistered: 409,
  InvalidCredentials: 401,
  ActorTypeNotAllowed: 403,
  SessionStoreFailed: 503,
  PasswordHashFailed: 500,
  CredentialDbFailed: 500,
  ActorProviderFailed: 500,
  InvalidRequestBody: 400,
}

export function httpStatusForError(error: unknown): number {
  const tag = (error as { _tag?: string } | null)?._tag
  return (tag && STATUS_BY_TAG[tag]) || 500
}
