import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import { InventoryService } from '../../../services/inventory'

/**
 * Resolve an inventory item's organization id from its numeric id, so a by-id
 * field can authorize against the owning org via auth's `permission` scope.
 * Callers pass the already-decoded id (the `globalID({ for })` arg/input field
 * validates the type + decodes at the schema boundary).
 *
 * Returns `null` when no live row matches (never existed or soft-deleted).
 * Callers treat `null` as "unknown resource" and grant `{ auth: true }`,
 * deferring to the resolver/service NotFound (404) rather than masking it as a
 * gate 403 — the org-permission check needs a real org.
 */
export function loadItemOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* InventoryService
      const row = yield* svc.findItem({ where: { id } }).pipe(
        Effect.catchTag('InventoryItemNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve an inventory level's organization id from its numeric id.
 */
export function loadLevelOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* InventoryService
      const row = yield* svc.findLevelById(id).pipe(
        Effect.catchTag('InventoryLevelNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a reservation's organization id from its numeric id.
 */
export function loadReservationOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* InventoryService
      const row = yield* svc.findReservationById(id).pipe(
        Effect.catchTag('ReservationNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
