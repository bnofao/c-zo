import type { GraphQLContext } from '../types'
import { GraphQLError } from 'graphql'

export function requireAdmin(ctx: GraphQLContext): void {
  if (ctx.auth.actorType !== 'admin') {
    throw new GraphQLError('Forbidden: admin access required', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    })
  }
}
