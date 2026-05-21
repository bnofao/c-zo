import type { StockLocationGraphQLSchemaBuilder } from '@czo/stock-location/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { decodeGlobalID, ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import {
  generateHandle,
  StockLocationService,
} from '../../../services'
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
        organizationId: t.field({ type: 'ID', required: true }),
        name: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()) }),
        handle: t.string({ validate: handleSchema.optional() }),
        isDefault: t.boolean(),
        isActive: t.boolean(),
        metadata: t.field({ type: 'JSONObject' }),
        address: t.field({ type: 'CreateStockLocationAddressInput' }),
      }),
    },
    {
      errors: { types: [ValidationError, HandleTaken] },
      authScopes: { permission: { resource: 'stock-location', actions: ['create'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id: orgId } = decodeGlobalID(input.organizationId)
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
            }, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )

  // ── updateStockLocation ───────────────────────────────────────────────────
  builder.relayMutationField(
    'updateStockLocation',
    {
      inputFields: t => ({
        id: t.field({ type: 'ID', required: true }),
        version: t.int({ required: true }),
        name: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional() }),
        handle: t.string({ validate: handleSchema.optional() }),
        metadata: t.field({ type: 'JSONObject' }),
        address: t.field({ type: 'UpdateStockLocationAddressInput' }),
      }),
    },
    {
      errors: { types: [ValidationError, StockLocationNotFound, OptimisticLockError] },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id } = decodeGlobalID(input.id)
        const stockLocation = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* StockLocationService
            yield* svc.findFirst({ where: { id: Number(id) } })
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
            }, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )

  // ── deleteStockLocation (soft delete) ─────────────────────────────────────
  builder.relayMutationField(
    'deleteStockLocation',
    {
      inputFields: t => ({
        id: t.field({ type: 'ID', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: { permission: { resource: 'stock-location', actions: ['delete'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id } = decodeGlobalID(input.id)
        const stockLocation = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* StockLocationService
            yield* svc.findFirst({ where: { id: Number(id) } })
            return yield* svc.softDelete(Number(id), input.version, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )

  // ── forceDeleteStockLocation (hard delete, cascades) ──────────────────────
  builder.relayMutationField(
    'forceDeleteStockLocation',
    {
      inputFields: t => ({
        id: t.field({ type: 'ID', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: { permission: { resource: 'stock-location', actions: ['delete'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id } = decodeGlobalID(input.id)
        const stockLocation = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* StockLocationService
            yield* svc.findFirst({ where: { id: Number(id) } })
            return yield* svc.delete(Number(id), input.version, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )

  // ── setStockLocationStatus ────────────────────────────────────────────────
  builder.relayMutationField(
    'setStockLocationStatus',
    {
      inputFields: t => ({
        id: t.field({ type: 'ID', required: true }),
        version: t.int({ required: true }),
        isActive: t.boolean({ required: true }),
      }),
    },
    {
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id } = decodeGlobalID(input.id)
        const stockLocation = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* StockLocationService
            yield* svc.findFirst({ where: { id: Number(id) } })
            return yield* svc.setStatus(Number(id), input.version, input.isActive, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )

  // ── setDefaultStockLocation ───────────────────────────────────────────────
  builder.relayMutationField(
    'setDefaultStockLocation',
    {
      inputFields: t => ({
        id: t.field({ type: 'ID', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
      errors: { types: [StockLocationNotFound, OptimisticLockError] },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const { id } = decodeGlobalID(input.id)
        const stockLocation = await ctx.runEffect(
Effect.gen(function* () {
            const svc = yield* StockLocationService
            yield* svc.findFirst({ where: { id: Number(id) } })
            return yield* svc.setDefault(Number(id), input.version, { actorId: ctx.auth.user!.id })
          }),
        )
        return { stockLocation }
      },
    },
    {
      outputFields: t => ({
        stockLocation: t.field({ type: 'StockLocation', resolve: p => p.stockLocation }),
      }),
    },
  )
}
