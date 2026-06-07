import type { InventoryGraphQLSchemaBuilder } from '@czo/inventory/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { InventoryService } from '../../../../services/inventory'
import { loadItemOrganizationId } from '../authz'
import { InventoryItemNotFound, SkuTaken } from '../errors'

// ─── InventoryItem Mutations ──────────────────────────────────────────────────

export function registerInventoryItemMutations(builder: InventoryGraphQLSchemaBuilder): void {
  // ── createInventoryItem ───────────────────────────────────────────────────
  builder.relayMutationField(
    'createInventoryItem',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true }),
        sku: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()) }),
        title: t.string(),
        description: t.string(),
        requiresShipping: t.boolean(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [ValidationError, SkuTaken] },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'inventory',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const item = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.createItem({
              organizationId: Number(input.organizationId.id),
              sku: input.sku,
              title: input.title ?? undefined,
              description: input.description ?? undefined,
              requiresShipping: input.requiresShipping ?? undefined,
              metadata: input.metadata,
            })
          }),
        )
        return { item }
      },
    },
    {
      outputFields: t => ({
        inventoryItem: t.field({ type: 'InventoryItem', resolve: p => p.item }),
      }),
    },
  )

  // ── updateInventoryItem ───────────────────────────────────────────────────
  builder.relayMutationField(
    'updateInventoryItem',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'InventoryItem', required: true }),
        version: t.int({ required: true }),
        sku: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional() }),
        title: t.string(),
        description: t.string(),
        requiresShipping: t.boolean(),
        metadata: t.field({ type: 'JSONObject' }),
      }),
    },
    {
      errors: { types: [ValidationError, InventoryItemNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadItemOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const item = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.updateItem(Number(input.id.id), input.version, {
              sku: input.sku ?? undefined,
              title: input.title ?? undefined,
              description: input.description ?? undefined,
              requiresShipping: input.requiresShipping ?? undefined,
              metadata: input.metadata,
            })
          }),
        )
        return { item }
      },
    },
    {
      outputFields: t => ({
        inventoryItem: t.field({ type: 'InventoryItem', resolve: p => p.item }),
      }),
    },
  )

  // ── deleteInventoryItem (soft delete) ─────────────────────────────────────
  builder.relayMutationField(
    'deleteInventoryItem',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'InventoryItem', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [InventoryItemNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadItemOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'inventory', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const item = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryService
            return yield* svc.softDeleteItem(Number(input.id.id), input.version)
          }),
        )
        return { item }
      },
    },
    {
      outputFields: t => ({
        inventoryItem: t.field({ type: 'InventoryItem', resolve: p => p.item }),
      }),
    },
  )
}
