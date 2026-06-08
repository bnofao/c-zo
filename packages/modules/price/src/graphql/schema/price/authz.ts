import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { PriceService } from '../../../services/price'

/**
 * Resolve a price set's organization id from its numeric id, so a by-id
 * field can authorize against the owning org via auth's `permission` scope.
 *
 * Returns `null` when no live row matches (never existed or soft-deleted).
 * Callers treat `null` as "unknown resource" and grant `{ auth: true }`,
 * deferring to the resolver/service NotFound rather than masking it as a
 * gate 403 — the org-permission check needs a real org.
 */
export function loadPriceSetOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* PriceService
      const row = yield* svc.findPriceSetById(id).pipe(
        Effect.catchTag('PriceSetNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a price list's organization id from its numeric id.
 */
export function loadPriceListOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* PriceService
      const row = yield* svc.findPriceListById(id).pipe(
        Effect.catchTag('PriceListNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a price's organization id from its numeric id.
 */
export function loadPriceOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* PriceService
      const row = yield* svc.findPriceById(id).pipe(
        Effect.catchTag('PriceNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
