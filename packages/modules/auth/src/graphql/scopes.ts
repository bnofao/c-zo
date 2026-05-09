import type { GraphQLContextMap } from '@czo/kit/graphql'

export function authScopes(ctx: GraphQLContextMap) {
  return {
    permission: async ({ resource, actions }: { resource: string, actions: string[] }) =>
      await ctx.auth?.authService?.hasPermission(
        { 
          userId: ctx?.auth?.user?.id,
          organizationId: ctx?.auth?.session?.activeOrganizationId,
          role: ctx?.auth?.user?.role,
        },
        { [resource]: actions },
      ) ?? false,
  }
}
