import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { AccessService } from '../services/access'
import { ApiKeyService } from '../services/api-key'
import { OrganizationService } from '../services/organization'
import { UserService } from '../services/user'

export function authScopes(ctx: GraphQLContextMap) {
  return {
    auth: !!ctx?.auth?.user,
    permission: async (
      { resource, actions, organization }:
      { resource: string, actions: string[], organization?: number },
    ) => {
      const userId = ctx?.auth?.user?.id
      const apiKey = ctx?.auth?.apiKey
      if (!userId && !apiKey)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          // ── API-key principal (no session user). v1: org-owned keys satisfy
          //    org-scoped checks only; authorize via the key's own grid. ──────
          if (!userId && apiKey) {
            if (organization == null)
              return false
            if (apiKey.organizationId == null || apiKey.organizationId !== organization)
              return false
            const access = yield* AccessService
            return yield* access.authorize(apiKey.permissions, { [resource]: actions })
          }

          // ── Session user (unchanged behaviour) ──────────────────────────
          if (organization != null) {
            // Org-scoped: authorize against the TARGET org using the actor's
            // member role IN that org. Non-member / roleless member → deny.
            const orgSvc = yield* OrganizationService
            const membership = yield* orgSvc.findFirstMember(organization, {
              where: { userId: Number(userId) },
            }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
            if (!membership?.role)
              return false
            const orgPerm = yield* OrganizationService
            return yield* orgPerm.hasPermission({
              orgId: String(organization),
              role: membership.role,
              permissions: { [resource]: actions },
            })
          }
          // No org context — session-based check via UserService.
          const users = yield* UserService
          return yield* users.hasPermission({
            role: ctx.auth?.user?.role ?? undefined,
            permissions: { [resource]: actions },
          })
        }),
      )
    },
    apiKeyOwner: async (
      input:
        | { keyId: number, action: 'update' | 'delete' }
        | { ownerType: 'USER' | 'ORGANIZATION', ownerId: number, action: 'create' },
    ) => {
      const userId = ctx?.auth?.user?.id
      if (!userId)
        return false

      return ctx.runEffect(
        Effect.gen(function* () {
          let ownerType: 'user' | 'organization'
          let ownerId: number

          if ('keyId' in input) {
            // update/delete path — pre-fetch the key
            const svc = yield* ApiKeyService
            const key = yield* svc.findFirst({ where: { id: input.keyId } }).pipe(
              Effect.catchTag('ApiKeyNotFound', () => Effect.succeed(null)),
            )
            if (!key)
              return false
            // Defensive: `key.reference` is a `text` column — guard against
            // unknown values (data corruption, future discriminator additions)
            // by denying outright rather than tumbling into the org branch.
            if (key.reference !== 'user' && key.reference !== 'organization')
              return false
            ownerType = key.reference
            ownerId = key.referenceId
          }
          else {
            // create path — discriminator already in input
            ownerType = input.ownerType === 'USER' ? 'user' : 'organization'
            ownerId = input.ownerId
          }

          if (ownerType === 'user') {
            return String(ownerId) === String(userId)
          }

          // organization — defer to org-scoped permission check
          const orgSvc = yield* OrganizationService
          const membership = yield* orgSvc.findFirstMember(ownerId, {
            where: { userId: Number(userId) },
          }).pipe(Effect.catchTag('MemberNotFound', () => Effect.succeed(null)))
          if (!membership?.role)
            return false
          const orgPerm = yield* OrganizationService
          return yield* orgPerm.hasPermission({
            orgId: String(ownerId),
            role: membership.role,
            permissions: { 'api-key': [input.action] },
          })
        }),
      )
    },
  }
}
