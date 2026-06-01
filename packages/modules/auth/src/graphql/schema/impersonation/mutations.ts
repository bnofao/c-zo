import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { decodeGlobalID } from '@czo/kit/graphql'
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

export function registerImpersonationMutations(builder: AuthGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'startImpersonation',
    {
      inputFields: t => ({
        targetUserId: t.id({ required: true }),
        ttl: t.int(),
        reason: t.string(),
      }),
    },
    {
      errors: {
        types: [
          UserNotFound,
          CannotImpersonateSelf,
          CannotImpersonateAdmin,
          CannotImpersonateBannedUser,
          CannotChainImpersonation,
          ImpersonationTtlTooLong,
        ],
      },
      authScopes: { permission: { resource: 'user', actions: ['impersonate'] } },
      resolve: async (_root, { input }, ctx) => {
        const adminId = Number(ctx.auth.user!.id)
        const adminToken = ctx.auth.session!.token
        const { id: targetIdRaw } = decodeGlobalID(input.targetUserId)
        const targetUserId = Number(targetIdRaw)

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
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session }),
        user: t.field({ type: 'User', resolve: p => p.user }),
      }),
    },
  )

  builder.relayMutationField(
    'stopImpersonation',
    // No client input — the active session identifies the impersonation.
    // GraphQL forbids an empty input object and the relay plugin omits
    // `clientMutationId` globally, so declare it here as the single field.
    { inputFields: t => ({ clientMutationId: t.string({ required: false }) }) },
    {
      errors: { types: [ImpersonationNotActive] },
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
      outputFields: t => ({
        session: t.field({ type: 'Session', resolve: p => p.session }),
        user: t.field({ type: 'User', resolve: p => p.user }),
      }),
    },
  )
}
