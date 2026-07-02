import { LIFE_URL } from '../env.server'
import { errorCode, GraphqlAdminError, isForbiddenError, isUnauthenticatedError } from './admin-error'

// Client-safe error type + denial-code predicates live in `./admin-error` (no
// server-only deps) so the client route boundary can import them without
// pulling this server module. Re-exported here for server-side callers + tests.
export { errorCode, GraphqlAdminError, isForbiddenError, isUnauthenticatedError }

/** A printable GraphQL document — codegen emits `TypedDocumentString` (stringifiable). */
interface Doc { toString: () => string }

async function gqlSubgraph<TData, TVars extends Record<string, unknown> = Record<string, unknown>>(
  subgraph: 'admin' | 'account',
  document: Doc | string,
  variables?: TVars,
  opts?: { cookie?: string },
): Promise<TData> {
  // When opts.cookie is provided (tests + explicit callers), use it directly.
  // Otherwise, pull the cookie off the incoming server request via the Start
  // runtime — imported lazily so the test path never touches the Start runtime.
  let cookie: string
  if (opts?.cookie !== undefined) {
    cookie = opts.cookie
  }
  else {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    cookie = getRequestHeader('cookie') ?? ''
  }

  const query = typeof document === 'string' ? document : document.toString()

  const res = await fetch(`${LIFE_URL}/graphql/${subgraph}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  })

  if (!res.ok)
    throw new GraphqlAdminError(`${subgraph} GraphQL HTTP ${res.status}`)

  const body = await res.json() as {
    data?: TData
    errors?: { message: string, extensions?: { code?: string } }[]
  }
  if (body.errors?.length) {
    const code = body.errors[0]?.extensions?.code
    const joined = body.errors.map(e => e.message).join('; ')
    // Prefix the message with `[CODE]` so detection survives even if the custom
    // `code` field is stripped crossing the createServerFn boundary. The raw
    // message is never shown to users — the UI renders i18n text.
    throw new GraphqlAdminError(code ? `[${code}] ${joined}` : joined, body.errors, code)
  }
  if (body.data == null)
    throw new GraphqlAdminError(`${subgraph} GraphQL returned no data`)
  return body.data
}

export async function gqlAdmin<TData, TVars extends Record<string, unknown> = Record<string, unknown>>(
  document: Doc | string,
  variables?: TVars,
  opts?: { cookie?: string },
): Promise<TData> {
  return gqlSubgraph<TData, TVars>('admin', document, variables, opts)
}

/**
 * Account sub-graph client — self-service flows (password reset, …). Same
 * transport as `gqlAdmin`; the reset mutations are token-gated, not
 * session-gated, but the cookie is forwarded all the same.
 */
export async function gqlAccount<TData, TVars extends Record<string, unknown> = Record<string, unknown>>(
  document: Doc | string,
  variables?: TVars,
  opts?: { cookie?: string },
): Promise<TData> {
  return gqlSubgraph<TData, TVars>('account', document, variables, opts)
}
