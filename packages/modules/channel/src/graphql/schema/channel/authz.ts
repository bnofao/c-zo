import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { ChannelService } from '../../../services/channel'

type Verb = 'read' | 'create' | 'update' | 'delete'

/**
 * Build the `permission` authScope for a channel tier:
 *   • `org` a number → ORG tier → check the member role in that org.
 *   • `org` null     → PLATFORM tier → no `organization`, so the GLOBAL
 *     `channel:<verb>` role is checked.
 * Mirrors `@czo/attribute`'s `attributePermission`.
 */
export function channelPermission(verb: Verb, org: number | null) {
  return org == null
    ? { permission: { resource: 'channel', actions: [verb] } }
    : { permission: { resource: 'channel', actions: [verb], organization: org } }
}

/**
 * Tier resolver for by-id gates: `undefined` (unknown row) → `{ auth: true }`
 * so the resolver/service surfaces a 404, never a gate 403; otherwise the
 * `permission` gate for the resource's tier (platform when `null`, org when a
 * number). Mirrors `@czo/attribute`'s `tierScope`.
 */
export function channelTierScope(org: number | null | undefined, verb: Verb) {
  return org === undefined ? { auth: true as const } : channelPermission(verb, org)
}

/**
 * Resolve a channel's tier by id: `undefined` = no live row (never existed or
 * soft-deleted); otherwise its `organizationId` (`null` = platform tier, a
 * number = that org). The `undefined`/`null` split lets by-id gates defer an
 * unknown id to the service's `ChannelNotFound` (404) while still authorizing a
 * real platform-tier row via the GLOBAL `channel` role.
 *
 * Callers pass the already-decoded id (the `globalID({ for })` arg/input field
 * validates the type + decodes at the schema boundary).
 */
export function loadChannelTier(ctx: GraphQLContextMap, id: number): Promise<number | null | undefined> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ChannelService
      const row = yield* svc.findFirst({ where: { id } }).pipe(
        Effect.catchTag('ChannelNotFound', () => Effect.succeed(undefined)),
      )
      return row === undefined ? undefined : row.organizationId
    }),
  )
}

/**
 * Thin alias retaining the legacy "null for not-found" semantics for the
 * stock-location link/unlink ops, which are strictly org-tier (a platform
 * channel has no org to scope against). Collapses both not-found and platform
 * to `null` so callers grant `{ auth: true }` and defer to the service.
 */
export function loadOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return loadChannelTier(ctx, id).then(tier => tier ?? null)
}
