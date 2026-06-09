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
        inventoryItemId: t.globalID({
          for: 'InventoryItem',
          required: true,
          description: 'The InventoryItem node whose stock is being recorded at the location.',
        }),
        stockLocationId: t.globalID({
          for: 'StockLocation',
          required: true,
          description: 'The StockLocation node where the stock is held; must belong to the same organization as the item.',
        }),
        stockedQuantity: t.int({
          description: 'Initial on-hand quantity physically present at the location; defaults to zero when omitted.',
        }),
        incomingQuantity: t.int({
          description: 'Initial expected inbound quantity not yet on hand; defaults to zero when omitted.',
        }),
      }),
    },
    {
      description: 'Creates the inventory level recording an item\'s stock at a stock location, requiring the inventory:update permission in the item\'s organization.',
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
        inventoryLevel: t.field({
          type: 'InventoryLevel',
          resolve: p => p.level,
          description: 'The newly created inventory level.',
        }),
      }),
    },
  )

  // ── setInventoryLevel ─────────────────────────────────────────────────────
  builder.relayMutationField(
    'setInventoryLevel',
    {
      inputFields: t => ({
        id: t.globalID({
          for: 'InventoryLevel',
          required: true,
          description: 'The InventoryLevel node to update.',
        }),
        version: t.int({
          required: true,
          description: 'Expected current version for optimistic locking; the update fails if the stored version differs.',
        }),
        stockedQuantity: t.int({
          description: 'New absolute on-hand quantity to set; leaves the existing value unchanged when omitted.',
        }),
        incomingQuantity: t.int({
          description: 'New absolute expected inbound quantity to set; leaves the existing value unchanged when omitted.',
        }),
      }),
    },
    {
      description: 'Sets absolute quantities on an inventory level, requiring the inventory:update permission in the item\'s organization and a matching version.',
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
        inventoryLevel: t.field({
          type: 'InventoryLevel',
          resolve: p => p.level,
          description: 'The inventory level with its updated quantities.',
        }),
      }),
    },
  )

  // ── adjustInventoryStock ──────────────────────────────────────────────────
  builder.relayMutationField(
    'adjustInventoryStock',
    {
      inputFields: t => ({
        id: t.globalID({
          for: 'InventoryLevel',
          required: true,
          description: 'The InventoryLevel node whose on-hand quantity is being adjusted.',
        }),
        delta: t.int({
          required: true,
          description: 'Signed amount added to the current on-hand quantity; negative values decrease it and may fail if stock is insufficient.',
        }),
      }),
    },
    {
      description: 'Adjusts an inventory level\'s on-hand quantity by a relative delta, requiring the inventory:update permission in the item\'s organization.',
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
        inventoryLevel: t.field({
          type: 'InventoryLevel',
          resolve: p => p.level,
          description: 'The inventory level with its newly adjusted on-hand quantity.',
        }),
      }),
    },
  )

  // ── deleteInventoryLevel ──────────────────────────────────────────────────
  builder.relayMutationField(
    'deleteInventoryLevel',
    {
      inputFields: t => ({
        id: t.globalID({
          for: 'InventoryLevel',
          required: true,
          description: 'The InventoryLevel node to delete.',
        }),
      }),
    },
    {
      description: 'Deletes an inventory level, requiring the inventory:delete permission in the item\'s organization; fails if the level still has reservations.',
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
        inventoryLevel: t.field({
          type: 'InventoryLevel',
          resolve: p => p.level,
          description: 'The inventory level that was deleted.',
        }),
      }),
    },
  )
}
