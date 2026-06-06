import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { StockLocationService } from '../../../services/stock-location'

/**
 * Resolve a stock location's organization id from its numeric id, so a by-id
 * field can authorize against the owning org via auth's `permission` scope.
 * Callers pass the already-decoded id (the `globalID({ for })` arg/input field
 * validates the type + decodes at the schema boundary).
 *
 * Returns `null` when no live row matches (never existed or soft-deleted).
 * Callers treat `null` as "unknown resource" and grant `{ auth: true }`,
 * deferring to the resolver/service `StockLocationNotFound` (404) rather than
 * masking it as a gate 403 — the org-permission check needs a real org.
 */
export function loadOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* StockLocationService
      const row = yield* svc.findFirst({ where: { id } }).pipe(
        Effect.catchTag('StockLocationNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
