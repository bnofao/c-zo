import type { GraphQLContextMap } from '@czo/kit/graphql'
import { decodeGlobalID } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { StockLocationService } from '../../../services/stock-location'

/**
 * Resolve a stock location's organization id from its global id, so a by-id
 * field can authorize against the owning org via auth's `permission` scope.
 *
 * Returns `null` when no live row matches (never existed or soft-deleted).
 * Callers treat `null` as "unknown resource" and grant `{ auth: true }`,
 * deferring to the resolver/service `StockLocationNotFound` (404) rather than
 * masking it as a gate 403 — the org-permission check needs a real org.
 */
export function loadOrganizationId(ctx: GraphQLContextMap, globalId: string): Promise<number | null> {
  const { id } = decodeGlobalID(globalId)
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* StockLocationService
      const row = yield* svc.findFirst({ where: { id: Number(id) } }).pipe(
        Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
