import type { SchemaIssue } from 'effect'
import { Data, SchemaIssue as Issue } from 'effect'

/**
 * Tagged error for a request body that fails `Schema` decoding. The HTTP
 * handlers decode via `Schema.decodeUnknownEffect`, whose failure is a
 * `SchemaError`; they re-tag its `issue` here so `httpStatusForError` maps it
 * to 400 and `errorResponseBody` can surface the per-field `details`.
 */
export class InvalidRequestBody extends Data.TaggedError('InvalidRequestBody')<{
  readonly issue: SchemaIssue.Issue
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

// Flattens an issue tree into `{ path, message }[]` (Standard Schema V1 shape).
const formatIssue = Issue.makeFormatterStandardSchemaV1()

export interface ErrorResponseBody {
  readonly error: string
  readonly details?: ReturnType<typeof formatIssue>['issues']
}

/**
 * Build the JSON error body. Only `InvalidRequestBody` exposes field-level
 * `details` (validation feedback is about the *client's own input*, not
 * internal state); every other error surfaces just its `code`, so a DB or
 * runtime `cause` can never leak — see `.claude/rules/security.md`.
 */
export function errorResponseBody(error: unknown): ErrorResponseBody {
  const code = (error as { code?: string } | null)?.code ?? 'ERROR'
  return error instanceof InvalidRequestBody
    ? { error: code, details: formatIssue(error.issue).issues }
    : { error: code }
}
