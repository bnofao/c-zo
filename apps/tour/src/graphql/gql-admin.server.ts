import { LIFE_URL } from '../env.server'

export class GraphqlAdminError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message)
    this.name = 'GraphqlAdminError'
  }
}

/** A printable GraphQL document — codegen emits `TypedDocumentString` (stringifiable). */
interface Doc { toString: () => string }

export async function gqlAdmin<TData, TVars extends Record<string, unknown> = Record<string, unknown>>(
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

  const res = await fetch(`${LIFE_URL}/graphql/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  })

  if (!res.ok)
    throw new GraphqlAdminError(`admin GraphQL HTTP ${res.status}`)

  const body = await res.json() as { data?: TData, errors?: { message: string }[] }
  if (body.errors?.length)
    throw new GraphqlAdminError(body.errors.map(e => e.message).join('; '), body.errors)
  if (body.data == null)
    throw new GraphqlAdminError('admin GraphQL returned no data')
  return body.data
}
