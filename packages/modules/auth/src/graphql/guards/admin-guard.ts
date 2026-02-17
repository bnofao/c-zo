import type { GraphQLFieldResolver } from 'graphql'
import type { GraphQLContext } from '../../types'
import { GraphQLError } from 'graphql'

export function requireAdmin(ctx: GraphQLContext): void {
  if (ctx.auth.actorType !== 'admin') {
    throw new GraphQLError('Forbidden: admin access required', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    })
  }
}

export function isAdmin() {
  return (next: GraphQLFieldResolver<any, any>) =>
    (root: any, args: any, ctx: GraphQLContext, info: any) => {
      requireAdmin(ctx)
      return next(root, args, ctx, info)
    }
}
