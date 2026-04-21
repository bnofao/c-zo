import type { SchemaBuilder } from '@czo/kit/graphql'
import type { StockLocationService, UpdateStockLocationInput } from '../../../services/stock-location.service'
import { OptimisticLockError } from '@czo/kit/db'
import { ConflictError, NotFoundError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { generateHandle } from '../../../services/stock-location.service'
import { createStockLocationSchema } from './inputs'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getService(): Promise<StockLocationService> {
  const container = useContainer()
  return container.make('stockLocation:service')
}

// ─── Stock Location Mutations ─────────────────────────────────────────────────

export function registerStockLocationMutations(builder: SchemaBuilder): void {
  // ── createStockLocation ───────────────────────────────────────────────────
  builder.mutationField('createStockLocation', t =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, ConflictError] },
      args: {
        input: t.arg({ type: 'CreateStockLocationInput', required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['create'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>) => {
        const raw = args.input as { name: string, handle?: string | null, organizationId?: { id: string } | string | null }
        const parsed = createStockLocationSchema.safeParse({
          ...raw,
          organizationId: (raw.organizationId as { id: string } | null | undefined)?.id ?? raw.organizationId,
          handle: raw.handle ?? generateHandle(raw.name),
        })
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const service = await getService()
        const existing = await service.findByHandle(
          parsed.data.organizationId,
          parsed.data.handle!,
        )
        if (existing) {
          throw new ConflictError(
            'StockLocation',
            'handle',
            `Handle '${parsed.data.handle}' already exists in organization`,
          )
        }
        return service.create(parsed.data as any)
      },
    }))

  // ── updateStockLocation ───────────────────────────────────────────────────
  builder.mutationField('updateStockLocation', t =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        input: t.arg({ type: 'UpdateStockLocationInput', required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>) => {
        const id = (args.id as { id: string }).id
        const version = args.version as number
        const input = args.input as UpdateStockLocationInput
        const service = await getService()
        const existing = await service.find(Number(id))
        if (!existing)
          throw new NotFoundError('StockLocation', id)

        return service.update(Number(id), version, input)
      },
    }))

  // ── deleteStockLocation ───────────────────────────────────────────────────
  builder.mutationField('deleteStockLocation', t =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['delete'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>) => {
        const id = (args.id as { id: string }).id
        const version = args.version as number
        const service = await getService()
        const existing = await service.find(Number(id))
        if (!existing)
          throw new NotFoundError('StockLocation', id)

        return service.softDelete(Number(id), version)
      },
    }))

  // ── setStockLocationStatus ────────────────────────────────────────────────
  builder.mutationField('setStockLocationStatus', t =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        isActive: t.arg.boolean({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>) => {
        const id = (args.id as { id: string }).id
        const version = args.version as number
        const isActive = args.isActive as boolean
        const service = await getService()
        const existing = await service.find(Number(id))
        if (!existing)
          throw new NotFoundError('StockLocation', id)

        return service.setStatus(Number(id), version, isActive)
      },
    }))

  // ── setDefaultStockLocation ───────────────────────────────────────────────
  builder.mutationField('setDefaultStockLocation', t =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: unknown, args: Record<string, unknown>) => {
        const id = (args.id as { id: string }).id
        const version = args.version as number
        const service = await getService()
        const existing = await service.find(Number(id))
        if (!existing)
          throw new NotFoundError('StockLocation', id)

        return service.setDefault(Number(id), version)
      },
    }))
}
