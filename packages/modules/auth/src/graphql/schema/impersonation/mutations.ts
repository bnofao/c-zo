import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { Duration, Effect } from 'effect'
import {
  CannotChainImpersonation,
  CannotImpersonateAdmin,
  CannotImpersonateBannedUser,
  CannotImpersonateSelf,
  ImpersonationNotActive,
  ImpersonationService,
  ImpersonationTtlTooLong,
} from '../../../services/impersonation'
import { SessionService } from '../../../services/session'
import { UserNotFound } from '../../../services/user'
import { sg } from '../subgraphs'

export function registerImpersonationMutations(builder: AuthGraphQLSchemaBuilder): void {
  const A = sg('admin')

  builder.relayMutationField(
    'startImpersonation',
    {
      ...A.input,
      inputFields: t => ({
        targetUserId: t.globalID({ for: 'User', required: true, description: 'The global ID of the user to impersonate.' }),
        ttl: t.int({ description: 'Optional lifetime of the impersonation session, in seconds.' }),
        reason: t.string({ description: 'Optional human-readable reason recorded for audit purposes.' }),
      }),
    },
    {
      ...A.field,
      description: 'Starts impersonating another user. Requires the global user:impersonate permission; mints a child session whose parent_token links back to the admin\'s session.',
      errors: {
        types: [
          UserNotFound,
          CannotImpersonateSelf,
          CannotImpersonateAdmin,
          CannotImpersonateBannedUser,
          CannotChainImpersonation,
          ImpersonationTtlTooLong,
        ],
        ...A.errorOpts,
      },
      authScopes: { permission: { resource: 'user', actions: ['impersonate'] } },
      resolve: async (_root, { input }, ctx) => {
        const adminId = Number(ctx.auth.user!.id)
        const adminToken = ctx.auth.session!.token
        const targetUserId = Number(input.targetUserId.id)

        const { result, cookie } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ImpersonationService
            const sessions = yield* SessionService
            const result = yield* svc.start({
              adminId,
              adminToken,
              targetUserId,
              ttl: input.ttl != null ? Duration.seconds(input.ttl) : undefined,
              reason: input.reason ?? undefined,
            })
            return { result, cookie: sessions.setCookie(result.session.token) }
          }),
        )
        ctx.setCookie(cookie.serialize())

        return result
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session, description: 'The newly minted child session that acts as the impersonated user.' }),
        user: t.field({ type: 'User', resolve: p => p.user, description: 'The target user now being impersonated.' }),
      }),
    },
  )

  builder.relayMutationField(
    'stopImpersonation',
    // No client input — the active session identifies the impersonation.
    // GraphQL forbids an empty input object and the relay plugin omits
    // `clientMutationId` globally, so declare it here as the single field.
    { ...A.input, inputFields: t => ({ clientMutationId: t.string({ required: false, description: 'Optional client-supplied identifier echoed back by the relay mutation.' }) }) },
    {
      ...A.field,
      description: 'Stops the active impersonation by walking back up to the parent (admin) session. Requires an active impersonation session.',
      errors: { types: [ImpersonationNotActive], ...A.errorOpts },
      authScopes: { auth: true },
      resolve: async (_root, _input, ctx) => {
        const currentToken = ctx.auth.session!.token
        const { result, cookie } = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ImpersonationService
            const sessions = yield* SessionService
            const result = yield* svc.stop(currentToken)
            return { result, cookie: sessions.setCookie(result.session.token) }
          }),
        )
        ctx.setCookie(cookie.serialize())

        return result
      },
    },
    {
      ...A.payload,
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session, description: 'The restored parent (admin) session.' }),
        user: t.field({ type: 'User', resolve: p => p.user, description: 'The admin user the session reverts to.' }),
      }),
    },
  )
}
