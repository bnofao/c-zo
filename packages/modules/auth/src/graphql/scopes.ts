import type { GraphQLContextMap } from '@czo/kit/graphql'
import { runEffect } from '@czo/kit/effect'
import { Effect } from 'effect'
import { AuthService } from '../services/auth'

export function authScopes(ctx: GraphQLContextMap) {
  return {
    permission: async ({ resource, actions }: { resource: string, actions: string[] }) => {
      const auth = ctx?.auth
      const userId = auth?.user?.id
      if (!auth || !userId)
        return false

      return runEffect(
        auth.runtime,
        Effect.gen(function* () {
          const svc = yield* AuthService
          return yield* svc.hasPermission(
            {
              userId,
              organizationId: auth.session?.activeOrganizationId,
              role: auth.user?.role,
            },
            { [resource]: actions },
          )
        }),
      )
    },
  }
}
