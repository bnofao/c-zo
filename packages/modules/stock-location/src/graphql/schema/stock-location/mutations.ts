import type { StockLocationGraphQLSchemaBuilder } from '@czo/stock-location/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import {
  generateHandle,
  StockLocationService,
} from '../../../services/stock-location'
import { loadOrganizationId } from './authz'
import { HandleTaken, StockLocationNotFound } from './errors'

const handleSchema = z.string().regex(/^[a-z0-9-]+$/, {
  message: 'Handle must be lowercase letters, digits, or hyphens only',
}).max(100)

// ─── Stock Location Mutations ─────────────────────────────────────────────────

export function registerStockLocationMutations(builder: StockLocationGraphQLSchemaBuilder): void {
  // ── createStockLocation ───────────────────────────────────────────────────
  builder.relayMutationField(
    'createStockLocation',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization that will own this stock location.' }),
        name: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()), description: 'Human-readable display name for the location, such as a warehouse or store name.' }),
        handle: t.string({ validate: handleSchema.optional(), description: 'URL-safe identifier, unique within the organization; auto-generated from the name when omitted.' }),
        isDefault: t.boolean({ description: 'When true, marks this as the organization\'s default stock location.' }),
        isActive: t.boolean({ description: 'Whether the location is active and available to fulfil stock.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Arbitrary key-value metadata attached to the location.' }),
        address: t.field({ type: 'CreateStockLocationAddressInput', description: 'Optional physical address to create alongside the location.' }),
      }),
    },
    {
      description: 'Creates a new organization-scoped stock location, optionally with an address.',
      errors: { types: [ValidationError, HandleTaken] },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'stock-location',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const orgId = input.organizationId.id
        const handle = input.handle ?? generateHandle(input.name)

        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.create({
              ...input,
              organizationId: Number(orgId),
              handle,
              address: input.address
                ? {
                    ...input.address,
                    addressLine1: input.address.addressLine1 ?? undefined,
                    city: input.address.city ?? undefined,
                    countryCode: input.address.countryCode ?? undefined,
                  }
                : undefined,
            })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The newly created stock location.' }),
      }),
    },
  )

  // ── updateStockLocation ───────────────────────────────────────────────────
  builder.relayMutationField(
    'updateStockLocation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'StockLocation', required: true, description: 'Global ID of the StockLocation to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
        name: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional(), description: 'New display name; omit to leave unchanged.' }),
        handle: t.string({ validate: handleSchema.optional(), description: 'New URL-safe handle, unique within the organization; omit to leave unchanged.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Replacement key-value metadata for the location.' }),
        address: t.field({ type: 'UpdateStockLocationAddressInput', description: 'Optional address fields to set or update on the location.' }),
      }),
    },
    {
      description: 'Updates an existing stock location\'s fields and optionally its address, guarded by optimistic locking.',
      errors: { types: [ValidationError, StockLocationNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = input.id.id
        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.update(Number(id), input.version, {
              name: input.name ?? undefined,
              handle: input.handle ?? undefined,
              metadata: input.metadata,
              address: input.address
                ? {
                    ...input.address,
                    addressLine1: input.address.addressLine1 ?? undefined,
                    city: input.address.city ?? undefined,
                    countryCode: input.address.countryCode ?? undefined,
                  }
                : undefined,
            })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The updated stock location.' }),
      }),
    },
  )

  // ── deleteStockLocation (soft delete) ─────────────────────────────────────
  builder.relayMutationField(
    'deleteStockLocation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'StockLocation', required: true, description: 'Global ID of the StockLocation to soft-delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Soft-deletes a stock location, marking it as removed while preserving the record.',
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = input.id.id
        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.softDelete(Number(id), input.version)
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The soft-deleted stock location.' }),
      }),
    },
  )

  // ── forceDeleteStockLocation (hard delete, cascades) ──────────────────────
  builder.relayMutationField(
    'forceDeleteStockLocation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'StockLocation', required: true, description: 'Global ID of the StockLocation to permanently delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Permanently deletes a stock location and cascades to its related records.',
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = input.id.id
        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.delete(Number(id), input.version)
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The permanently deleted stock location.' }),
      }),
    },
  )

  // ── setStockLocationStatus ────────────────────────────────────────────────
  builder.relayMutationField(
    'setStockLocationStatus',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'StockLocation', required: true, description: 'Global ID of the StockLocation whose active status is changing.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
        isActive: t.boolean({ required: true, description: 'Whether the location should be active and available to fulfil stock.' }),
      }),
    },
    {
      description: 'Activates or deactivates a stock location.',
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = input.id.id
        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.setStatus(Number(id), input.version, input.isActive)
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The stock location with its updated active status.' }),
      }),
    },
  )

  // ── setDefaultStockLocation ───────────────────────────────────────────────
  builder.relayMutationField(
    'setDefaultStockLocation',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'StockLocation', required: true, description: 'Global ID of the StockLocation to mark as the organization\'s default.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Sets a stock location as the organization\'s default, unsetting the previous default.',
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'stock-location', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const id = input.id.id
        const stockLocation = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* StockLocationService
            return yield* svc.setDefault(Number(id), input.version)
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation, description: 'The stock location now marked as the organization\'s default.' }),
      }),
    },
  )
}
