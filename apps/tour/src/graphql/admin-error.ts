/**
 * Client-safe admin GraphQL error + denial-code detection.
 *
 * Kept free of any server-only import (no `env.server`, no `node:*`) so route
 * error boundaries can import the predicates into the CLIENT bundle. The
 * server transport (`gql-admin.server.ts`) re-exports these.
 */
export class GraphqlAdminError extends Error {
  constructor(message: string, readonly detail?: unknown, readonly code?: string) {
    super(message)
    this.name = 'GraphqlAdminError'
  }
}

/**
 * Extract a denial code from a thrown error — robust to the `createServerFn`
 * serialized shape (the error crosses the RPC boundary as a plain object,
 * prototype lost) and to a `[CODE]` message prefix `gqlAdmin` writes as a
 * belt-and-suspenders fallback when the API tags a denial.
 */
export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0)
      return code
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') {
      const m = /^\[([A-Z_]+)\]/.exec(message)
      if (m)
        return m[1]
    }
  }
  return undefined
}

export function isForbiddenError(err: unknown): boolean {
  return errorCode(err) === 'FORBIDDEN'
}

export function isUnauthenticatedError(err: unknown): boolean {
  return errorCode(err) === 'UNAUTHENTICATED'
}
