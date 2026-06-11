import type { GraphQLContextMap } from '@czo/kit/graphql'
import { UnauthenticatedError } from '@czo/kit/graphql'

/**
 * The acting session user's id, or `UnauthenticatedError`. Use in resolvers that
 * need *the acting user* (inviter, impersonating admin, account owner). A request
 * authenticated by an API key has no session user, so this throws — a key can
 * never be the acting user. The actor is always server-derived; never accept it
 * as a client-supplied input (that would let a caller forge the actor).
 */
export function requireUserId(ctx: GraphQLContextMap): number {
  const id = ctx.auth?.user?.id
  if (id == null)
    throw new UnauthenticatedError()
  return Number(id)
}

/** The current session token, or `UnauthenticatedError`. */
export function requireSessionToken(ctx: GraphQLContextMap): string {
  const token = ctx.auth?.session?.token
  if (token == null)
    throw new UnauthenticatedError()
  return token
}
