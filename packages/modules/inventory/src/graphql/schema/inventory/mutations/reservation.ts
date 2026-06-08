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
        inventoryItemId: t.globalID({ for: 'InventoryItem', required: true }),
        stockLocationId: t.globalID({ for: 'StockLocation', required: true }),
        quantity: t.int({ required: true }),
        lineItemId: t.string(),
        description: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
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
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation }),
      }),
    },
  )

  // ── updateReservation ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateReservation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Reservation', required: true }),
        quantity: t.int(),
        lineItemId: t.string(),
        description: t.string(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
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
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation }),
      }),
    },
  )

  // ── deleteReservation ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteReservation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Reservation', required: true }),
      }),
    },
    {
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
        reservation: t.field({ type: 'Reservation', resolve: p => p.reservation }),
      }),
    },
  )
}
