import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { AuthService } from '../services/auth'
import { OrganizationService } from '../services/organization'

export function authScopes(ctx: GraphQLContextMap) {
  return {
    auth: !!ctx?.auth?.user,
    permission: async (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      if (!userId)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          if (organization != null) {
            // Org-scoped: authorize against the TARGET org using the actor's
            // member role IN that org. Non-member / roleless member → deny.
            const orgSvc = yield* OrganizationService
            const membership = yield* orgSvc.findFirstMember(organization, {
              where: { userId: Number(userId) },
            }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
            if (!membership?.role)
              return false
            const authSvc = yield* AuthService
            return yield* authSvc.hasPermission(
              { userId: String(userId), organizationId: String(organization), role: membership.role },
              { [resource]: actions },
            )
          }
          // No org context — unchanged session-based check.
          const authSvc = yield* AuthService
          return yield* authSvc.hasPermission(
            {
              userId: String(userId),
              organizationId: ctx.auth?.session?.activeOrganizationId ?? undefined,
              role: ctx.auth?.user?.role ?? undefined,
            },
            { [resource]: actions },
          )
        }),
      )
    },
  }
}
