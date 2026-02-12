import type { Auth } from '../config/auth.config'
import type { AuthContext } from '../types'
import { GraphQLError, Kind, parse } from 'graphql'
import { extractCredentials } from './credential-extractor'

const INTROSPECTION_FIELDS = new Set(['__schema', '__type', '__typename'])

export function isIntrospectionQuery(
  body: { query?: string, operationName?: string } | null,
): boolean {
  if (!body || typeof body.query !== 'string' || body.query.trim() === '') {
    return false
  }

  if (body.operationName === 'IntrospectionQuery') {
    return true
  }

  let document
  try {
    document = parse(body.query)
  }
  catch {
    return false
  }

  const operations = document.definitions.filter(
    def => def.kind === Kind.OPERATION_DEFINITION,
  )

  if (operations.length === 0) {
    return false
  }

  return operations.every(op =>
    op.kind === Kind.OPERATION_DEFINITION
    && op.operation === 'query'
    && op.selectionSet.selections.length > 0
    && op.selectionSet.selections.every(
      sel => sel.kind === Kind.FIELD && INTROSPECTION_FIELDS.has(sel.name.value),
    ),
  )
}

export interface ValidateGraphQLAuthOptions {
  auth: Auth
  request: Request
  cookiePrefix?: string
}

function unauthenticatedError(): GraphQLError {
  return new GraphQLError('Unauthenticated', {
    extensions: {
      code: 'UNAUTHENTICATED',
      http: { status: 401 },
    },
  })
}

export async function validateGraphQLAuth(
  options: ValidateGraphQLAuthOptions,
): Promise<AuthContext> {
  const { auth, request, cookiePrefix = 'czo' } = options

  const credentials = extractCredentials(request, cookiePrefix)
  if (!credentials) {
    throw unauthenticatedError()
  }

  let sessionResponse
  try {
    sessionResponse = await auth.api.getSession({
      headers: credentials.headers,
    })
  }
  catch {
    throw unauthenticatedError()
  }

  if (!sessionResponse) {
    throw unauthenticatedError()
  }

  const { session, user } = sessionResponse as {
    session: {
      id: string
      userId: string
      expiresAt: Date
      actorType?: string
      authMethod?: string
      organizationId?: string | null
    }
    user: {
      id: string
      email: string
      name: string
    }
  }

  return {
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt instanceof Date
        ? session.expiresAt
        : new Date(session.expiresAt),
      actorType: session.actorType ?? 'customer',
      authMethod: session.authMethod ?? 'email',
      organizationId: session.organizationId ?? null,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    actorType: session.actorType ?? 'customer',
    organization: session.organizationId ?? null,
    authSource: credentials.source,
  }
}
