import type { GraphQLContext } from '../types'
import { GraphQLError } from 'graphql'

export function requirePermission(
  ctx: GraphQLContext,
  resource: string,
  action: string,
  organizationId?: string,
): Promise<void> {
  const orgId = organizationId ?? ctx.auth.organization ?? undefined

  return ctx.permissionService.hasPermission(
    { userId: ctx.auth.user.id, organizationId: orgId },
    { [resource]: [action] },
    ctx.auth.user.role,
  ).then((allowed) => {
    if (!allowed) {
      throw new GraphQLError(`Forbidden: missing permission ${resource}:${action}`, {
        extensions: { code: 'FORBIDDEN', http: { status: 403 } },
      })
    }
  })
}

export function hasPermission(resource: string, action: string) {
  return (next: (...args: unknown[]) => unknown) =>
    async (root: unknown, args: unknown, ctx: GraphQLContext, info: unknown) => {
      await requirePermission(ctx, resource, action)
      return next(root, args, ctx, info)
    }
}

export async function canDo(
  ctx: GraphQLContext,
  resource: string,
  action: string,
  organizationId?: string,
): Promise<boolean> {
  const orgId = organizationId ?? ctx.auth.organization ?? undefined

  return ctx.permissionService.hasPermission(
    { userId: ctx.auth.user.id, organizationId: orgId },
    { [resource]: [action] },
    ctx.auth.user.role,
  )
}
