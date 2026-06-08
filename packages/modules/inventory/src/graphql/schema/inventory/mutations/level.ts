import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import { InventoryService } from '../../../../services/inventory'
import { loadItemOrganizationId, loadLevelOrganizationId } from '../authz'
import {
  CrossOrgStockLocation,
  InsufficientStock,
  InventoryItemNotFound,
  InventoryLevelNotFound,
  LevelAlreadyExists,
  LevelHasReservations,
} from '../errors'

// ─── InventoryLevel Mutations ─────────────────────────────────────────────────

export function registerInventoryLevelMutations(builder: InventoryGraphQLSchemaBuilder): void {
  // ── createInventoryLevel ──────────────────────────────────────────────────
  builder.relayMutationField(
    'createInventoryLevel',
    {
      inputFields: t => ({
        inventoryItemId: t.globalID({ for: 'InventoryItem', required: true }),
        stockLocationId: t.globalID({ for: 'StockLocation', required: true }),
        stockedQuantity: t.int(),
        incomingQuantity: t.int(),
      }),
    },
    {
      errors: { types: [InventoryItemNotFound, CrossOrgStockLocation, LevelAlreadyExists] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadItemOrganizationId(ctx, Number(args.input.inventoryItemId.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const level = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.createLevel(
              Number(input.inventoryItemId.id),
              Number(input.stockLocationId.id),
              {
                stocked: input.stockedQuantity ?? undefined,
                incoming: input.incomingQuantity ?? undefined,
              },
            )
          }),
        )
        return { level }
      },
    },
    {
      outputFields: t => ({
        inventoryLevel: t.field({ type: 'InventoryLevel', resolve: p => p.level }),
      }),
    },
  )

  // ── setInventoryLevel ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'setInventoryLevel',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'InventoryLevel', required: true }),
        version: t.int({ required: true }),
        stockedQuantity: t.int(),
        incomingQuantity: t.int(),
      }),
    },
    {
      errors: { types: [InventoryLevelNotFound, OptimisticLockError, InsufficientStock] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadLevelOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const level = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.setLevel(Number(input.id.id), input.version, {
              stocked: input.stockedQuantity ?? undefined,
              incoming: input.incomingQuantity ?? undefined,
            })
          }),
        )
        return { level }
      },
    },
    {
      outputFields: t => ({
        inventoryLevel: t.field({ type: 'InventoryLevel', resolve: p => p.level }),
      }),
    },
  )

  // ── adjustInventoryStock ──────────────────────────────────────────────────
  builder.relayMutationField(
    'adjustInventoryStock',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'InventoryLevel', required: true }),
        delta: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [InventoryLevelNotFound, InsufficientStock] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadLevelOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const level = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.adjustStocked(Number(input.id.id), input.delta)
          }),
        )
        return { level }
      },
    },
    {
      outputFields: t => ({
        inventoryLevel: t.field({ type: 'InventoryLevel', resolve: p => p.level }),
      }),
    },
  )

  // ── deleteInventoryLevel ──────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteInventoryLevel',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'InventoryLevel', required: true }),
      }),
    },
    {
      errors: { types: [InventoryLevelNotFound, LevelHasReservations] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadLevelOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const level = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.deleteLevel(Number(input.id.id))
          }),
        )
        return { level }
      },
    },
    {
      outputFields: t => ({
        inventoryLevel: t.field({ type: 'InventoryLevel', resolve: p => p.level }),
      }),
    },
  )
}
