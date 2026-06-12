import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { organizations } from '@czo/auth/schema'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { stockLocations } from '@czo/stock-location/schema'
import * as StockLocationMod from '@czo/stock-location/services'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { channelRelations } from '../database/relations'
import { channels, channelStockLocations } from '../database/schema'
import * as Channel from './channel'
import * as ChannelEvents from './events/channel'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const ChannelPostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: channelRelations({ channels, channelStockLocations, stockLocations, organizations }),
})
const truncateChannel = truncateTables(channelStockLocations, channels)

// Stub: stock location id 200 → org 2 (cross-org); anything else → org 1 (same org).
const StockLocationStub = Layer.succeed(StockLocationMod.StockLocation.StockLocationService, {
  findFirst: (config: any) => {
    const id = config?.where?.id as number
    const organizationId = id === 200 ? 2 : 1
    return Effect.succeed({ id, organizationId } as any)
  },
} as any)

const TestLayer = Channel.layer.pipe(
  Layer.provide(ChannelEvents.layer),
  Layer.provide(StockLocationStub),
  Layer.provideMerge(ChannelPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('ChannelService', (it) => {
  it.effect('create + findFirst round-trips a channel', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const created = yield* svc.create({ organizationId: 1, name: 'Web Store', handle: 'web-store' })
      expect(created.handle).toBe('web-store')
      const found = yield* svc.findFirst({ where: { id: created.id } })
      expect(found.id).toBe(created.id)
    }))

  it.effect('update rejects a stale version (OptimisticLockError)', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const c = yield* svc.create({ organizationId: 1, name: 'A', handle: 'a' })
      yield* svc.update(c.id, c.version, { name: 'B' })
      const err = yield* svc.update(c.id, c.version, { name: 'C' }).pipe(Effect.flip) // stale
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('softDelete then findFirst → ChannelNotFound', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const c = yield* svc.create({ organizationId: 1, name: 'D', handle: 'd' })
      yield* svc.softDelete(c.id, c.version)
      const err = yield* svc.findFirst({ where: { id: c.id } }).pipe(Effect.flip)
      expect(err._tag).toBe('ChannelNotFound')
    }))

  it.effect('create with a duplicate handle in the same org → ChannelHandleTaken', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      yield* svc.create({ organizationId: 1, name: 'E', handle: 'dup' })
      const err = yield* svc.create({ organizationId: 1, name: 'E2', handle: 'dup' }).pipe(Effect.flip)
      expect(err._tag).toBe('ChannelHandleTaken')
    }))

  it.effect('creates a platform channel (organizationId null) and enforces unique platform handle', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const a = yield* svc.create({ organizationId: null, name: 'Global Web', handle: 'global-web' })
      expect(a.organizationId).toBeNull()
      const dup = yield* svc.create({ organizationId: null, name: 'Dup', handle: 'global-web' }).pipe(Effect.flip)
      expect(dup._tag).toBe('ChannelHandleTaken')
      const orgCh = yield* svc.create({ organizationId: 1, name: 'Org Web', handle: 'global-web' })
      expect(orgCh.organizationId).toBe(1)
    }))

  it.effect('addStockLocations links a same-org location; rejects cross-org', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const ch = yield* svc.create({ organizationId: 1, name: 'C', handle: 'c' })

      yield* svc.addStockLocations(ch.id, [100]) // org 1 → ok
      const withLinks = yield* svc.findFirst({ where: { id: ch.id }, with: { stockLocationLinks: true } })
      expect((withLinks as any).stockLocationLinks.map((l: any) => l.stockLocationId)).toContain(100)

      const err = yield* svc.addStockLocations(ch.id, [200]).pipe(Effect.flip) // org 2 → cross-org
      expect(err._tag).toBe('CrossOrgStockLocation')
    }))

  it.effect('removeStockLocations unlinks', () =>
    Effect.gen(function* () {
      yield* truncateChannel
      const svc = yield* Channel.ChannelService
      const ch = yield* svc.create({ organizationId: 1, name: 'C2', handle: 'c2' })
      yield* svc.addStockLocations(ch.id, [100, 101])
      yield* svc.removeStockLocations(ch.id, [100])
      const withLinks = yield* svc.findFirst({ where: { id: ch.id }, with: { stockLocationLinks: true } })
      const ids = (withLinks as any).stockLocationLinks.map((l: any) => l.stockLocationId)
      expect(ids).toContain(101)
      expect(ids).not.toContain(100)
    }))
})
