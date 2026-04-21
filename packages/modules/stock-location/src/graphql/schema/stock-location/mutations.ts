import type { StockLocationService } from '../../../services/stock-location.service'
import { OptimisticLockError } from '@czo/kit/db'
import { ConflictError, NotFoundError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { generateHandle } from '../../../services/stock-location.service'
import { createStockLocationSchema, updateStockLocationSchema } from './inputs'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getService(): Promise<StockLocationService> {
  const container = useContainer()
  return container.make('stockLocation:service')
}

// ─── Stock Location Mutations ─────────────────────────────────────────────────

export function registerStockLocationMutations(builder: any): void {
  // ── createStockLocation ───────────────────────────────────────────────────
  (builder as any).mutationField('createStockLocation', (t: any) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, ConflictError] },
      args: {
        input: t.arg({ type: 'CreateStockLocationInput', required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['create'] } },
      resolve: async (_root: any, args: any) => {
        const raw = args.input
        const parsed = createStockLocationSchema.safeParse({
          ...raw,
          organizationId: raw.organizationId?.id ?? raw.organizationId,
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
  ;(builder as any).mutationField('updateStockLocation', (t: any) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [ValidationError, NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        input: t.arg({ type: 'UpdateStockLocationInput', required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: any, args: any) => {
        const parsed = updateStockLocationSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        const service = await getService()
        const existing = await service.find(Number(args.id.id))
        if (!existing)
          throw new NotFoundError('StockLocation', args.id.id)

        return service.update(Number(args.id.id), args.version, parsed.data)
      },
    }))

  // ── deleteStockLocation ───────────────────────────────────────────────────
  ;(builder as any).mutationField('deleteStockLocation', (t: any) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['delete'] } },
      resolve: async (_root: any, args: any) => {
        const service = await getService()
        const existing = await service.find(Number(args.id.id))
        if (!existing)
          throw new NotFoundError('StockLocation', args.id.id)

        return service.softDelete(Number(args.id.id), args.version)
      },
    }))

  // ── setStockLocationStatus ────────────────────────────────────────────────
  ;(builder as any).mutationField('setStockLocationStatus', (t: any) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
        isActive: t.arg.boolean({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: any, args: any) => {
        const service = await getService()
        const existing = await service.find(Number(args.id.id))
        if (!existing)
          throw new NotFoundError('StockLocation', args.id.id)

        return service.setStatus(Number(args.id.id), args.version, args.isActive)
      },
    }))

  // ── setDefaultStockLocation ───────────────────────────────────────────────
  ;(builder as any).mutationField('setDefaultStockLocation', (t: any) =>
    t.field({
      type: 'StockLocation',
      errors: { types: [NotFoundError, OptimisticLockError] },
      args: {
        id: t.arg.globalID({ required: true, for: ['StockLocation'] }),
        version: t.arg.int({ required: true }),
      },
      authScopes: { permission: { resource: 'stock-location', actions: ['update'] } },
      resolve: async (_root: any, args: any) => {
        const service = await getService()
        const existing = await service.find(Number(args.id.id))
        if (!existing)
          throw new NotFoundError('StockLocation', args.id.id)

        return service.setDefault(Number(args.id.id), args.version)
      },
    }))
}
