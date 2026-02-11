import type { Auth } from '../config/auth.config'
import type { AuthContext } from '../types'
import { GraphQLError } from 'graphql'
import { extractCredentials } from './credential-extractor'

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
      token: string
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
      token: session.token,
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
