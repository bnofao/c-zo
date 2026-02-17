import type { GraphQLContext } from '../types'
import { GraphQLError } from 'graphql'

export function requireAdmin(ctx: GraphQLContext): void {
  if (ctx.auth.actorType !== 'admin') {
    throw new GraphQLError('Forbidden: admin access required', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    })
  }
}

export function isAdmin() {
  return (next: (...args: unknown[]) => unknown) =>
    (root: unknown, args: unknown, ctx: GraphQLContext, info: unknown) => {
      requireAdmin(ctx)
      return next(root, args, ctx, info)
    }
}
