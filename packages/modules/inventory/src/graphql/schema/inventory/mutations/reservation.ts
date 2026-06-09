import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { Effect } from 'effect'
import { InventoryService } from '../../../../services/inventory'
import { loadItemOrganizationId, loadReservationOrganizationId } from '../authz'
import { InsufficientInventory, InventoryLevelNotFound, ReservationNotFound } from '../errors'

// ─── Reservation Mutations ────────────────────────────────────────────────────

export function registerReservationMutations(builder: InventoryGraphQLSchemaBuilder): void {
  // ── createReservation ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'createReservation',
    {
      inputFields: t => ({
        inventoryItemId: t.globalID({ for: 'InventoryItem', required: true, description: 'The InventoryItem whose stock the reservation holds.' }),
        stockLocationId: t.globalID({ for: 'StockLocation', required: true, description: 'The StockLocation at which the stock is reserved.' }),
        quantity: t.int({ required: true, description: 'The number of units to hold, deducted from available stock at the location.' }),
        lineItemId: t.string({ description: 'The order line item this reservation backs.' }),
        description: t.string({ description: 'A free-text note explaining the reservation.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary key-value data attached to the reservation.' }),
      }),
    },
    {
      description: 'Reserves a quantity of an inventory item at a stock location, reducing available stock until the reservation is released. Fails when available stock is insufficient.',
      errors: { types: [InventoryLevelNotFound, InsufficientInventory] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadItemOrganizationId(ctx, Number(args.input.inventoryItemId.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const createdBy = ctx.auth?.user?.id != null ? Number(ctx.auth.user.id) : undefined
        const reservation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.createReservation({
              inventoryItemId: Number(input.inventoryItemId.id),
              stockLocationId: Number(input.stockLocationId.id),
              quantity: input.quantity,
              lineItemId: input.lineItemId ?? undefined,
              description: input.description ?? undefined,
              createdBy,
              metadata: input.metadata,
            })
          }),
        )
        return { reservation }
      },
    },
    {
      outputFields: t => ({
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation, description: 'The newly created reservation.' }),
      }),
    },
  )

  // ── updateReservation ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateReservation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Reservation', required: true, description: 'The Reservation to update.' }),
        quantity: t.int({ description: 'The new number of units to hold; adjusts available stock accordingly and fails if insufficient.' }),
        lineItemId: t.string({ description: 'The order line item this reservation backs.' }),
        description: t.string({ description: 'A free-text note explaining the reservation.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary key-value data attached to the reservation.' }),
      }),
    },
    {
      description: 'Updates an existing reservation, optionally changing the reserved quantity and re-checking available stock. Fails when the new quantity exceeds available stock.',
      errors: { types: [ReservationNotFound, InsufficientInventory] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadReservationOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const reservation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.updateReservation(Number(input.id.id), {
              quantity: input.quantity ?? undefined,
              lineItemId: input.lineItemId ?? undefined,
              description: input.description ?? undefined,
              metadata: input.metadata ?? undefined,
            })
          }),
        )
        return { reservation }
      },
    },
    {
      outputFields: t => ({
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation, description: 'The updated reservation.' }),
      }),
    },
  )

  // ── deleteReservation ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteReservation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Reservation', required: true, description: 'The Reservation to release.' }),
      }),
    },
    {
      description: 'Releases a reservation, returning its held quantity to available stock at the location.',
      errors: { types: [ReservationNotFound] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadReservationOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const reservation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.deleteReservation(Number(input.id.id))
          }),
        )
        return { reservation }
      },
    },
    {
      outputFields: t => ({
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation, description: 'The reservation that was released.' }),
      }),
    },
  )
}
