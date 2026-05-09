import { Effect, Layer } from 'effect'
import { beforeEach, describe, expect, vi } from 'vitest'
import { it } from 'vitest'
import { expectFailure, expectSuccess } from '@czo/kit/effect'
import { DrizzleDb } from '@czo/kit/db/effect'
import {
  ApiKeyService,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  RateLimited,
  Unauthorized,
  UsageExceeded,
} from '../services/api-key'
import { OrganizationService } from '../services/organization'
import { ApiKeyServiceLive } from './api-key'

// ─── Mock Drizzle client ─────────────────────────────────────────────

interface ApiKeyRow {
  id: number
  key: string
  enabled: boolean | null
  expiresAt: Date | null
  permissions: Record<string, string[]> | null
  rateLimitEnabled: boolean | null
  rateLimitTimeWindow: number | null
  rateLimitMax: number | null
  requestCount: number | null
  remaining: number | null
  refillAmount: number | null
  refillInterval: number | null
  lastRequest: Date | null
  lastRefillAt: Date | null
  createdAt: Date
  updatedAt: Date
  reference: string
  referenceId: number
}

function makeMockDb(initialRow: Partial<ApiKeyRow> | null) {
  const findFirst = vi.fn().mockResolvedValue(initialRow ?? undefined)
  const updateReturning = vi.fn().mockResolvedValue(initialRow ? [{ ...initialRow }] : [])
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const db = {
    query: { apikeys: { findFirst, findMany: vi.fn().mockResolvedValue([]) } },
    update,
    insert: vi.fn(),
    delete: vi.fn(),
  }
  return { db, spies: { findFirst, updateReturning, updateWhere, updateSet, update } }
}

const orgStub = Layer.succeed(OrganizationService, {
  checkMembership: () => Effect.succeed(true),
})

function makeTestLayer(db: object) {
  const dbLayer = Layer.succeed(DrizzleDb, db as never)
  return ApiKeyServiceLive.pipe(Layer.provide(Layer.mergeAll(dbLayer, orgStub)))
}

const validRow = (overrides: Partial<ApiKeyRow> = {}): ApiKeyRow => ({
  id: 1,
  key: 'hashed-abc',
  enabled: true,
  expiresAt: null,
  permissions: null,
  rateLimitEnabled: false,
  rateLimitTimeWindow: null,
  rateLimitMax: null,
  requestCount: 0,
  remaining: null,
  refillAmount: null,
  refillInterval: null,
  lastRequest: null,
  lastRefillAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  reference: 'user',
  referenceId: 1,
  ...overrides,
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('apiKeyServiceLive — verify / validate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('empty plainKey → InvalidApiKey (no DB hit)', async () => {
    const { db, spies } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.verify('')
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), InvalidApiKey)
    expect(spies.findFirst).not.toHaveBeenCalled()
  })

  it('unknown hash → InvalidApiKey', async () => {
    const { db } = makeMockDb(null)
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.verify('unknown-plain')
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), InvalidApiKey)
  })

  it('disabled key → KeyDisabled', async () => {
    const { db } = makeMockDb(validRow({ enabled: false }))
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), KeyDisabled)
  })

  it('expired key → KeyExpired with keyId', async () => {
    const past = new Date(Date.now() - 1000)
    const { db } = makeMockDb(validRow({ id: 42, expiresAt: past }))
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    const err = await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db))),
      KeyExpired,
    )
    expect(err.keyId).toBe(42)
  })

  it('permission insufficient → Unauthorized', async () => {
    const { db } = makeMockDb(validRow({ permissions: { users: ['read'] } }))
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc', { permissions: { users: ['write'] } })
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), Unauthorized)
  })

  it('rate-limit enabled with windowMs <= 0 → Misconfigured', async () => {
    const { db } = makeMockDb(validRow({
      rateLimitEnabled: true,
      rateLimitTimeWindow: 0,
      rateLimitMax: 10,
    }))
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    const err = await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db))),
      Misconfigured,
    )
    expect(err.reason).toMatch(/must be > 0/)
  })

  it('rate-limit cap reached in window → RateLimited with tryAgainIn', async () => {
    const now = Date.now()
    const { db } = makeMockDb(validRow({
      rateLimitEnabled: true,
      rateLimitTimeWindow: 60_000,
      rateLimitMax: 5,
      requestCount: 5,
      lastRequest: new Date(now - 10_000),
    }))
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    const err = await expectFailure(
      program.pipe(Effect.provide(makeTestLayer(db))),
      RateLimited,
    )
    expect(err.tryAgainIn).toBeGreaterThan(0)
    expect(err.tryAgainIn).toBeLessThanOrEqual(60_000)
  })

  it('null rate-limit window/max → rate-limit disabled, success path', async () => {
    const row = validRow({
      rateLimitEnabled: true,
      rateLimitTimeWindow: null,
      rateLimitMax: null,
    })
    const { db, spies } = makeMockDb(row)
    spies.updateReturning.mockResolvedValue([row])
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result.id).toBe(1)
  })

  it('UPDATE returns 0 rows → UsageExceeded', async () => {
    const row = validRow({ remaining: 0 })
    const { db, spies } = makeMockDb(row)
    spies.updateReturning.mockResolvedValue([])
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    await expectFailure(program.pipe(Effect.provide(makeTestLayer(db))), UsageExceeded)
  })

  it('successful validate → returns updated row', async () => {
    const row = validRow({ id: 7, remaining: 10 })
    const { db, spies } = makeMockDb(row)
    spies.updateReturning.mockResolvedValue([{ ...row, remaining: 9 }])
    const program = Effect.gen(function* () {
      const svc = yield* ApiKeyService
      return yield* svc.validate('hashed-abc')
    })
    const result = await expectSuccess(program.pipe(Effect.provide(makeTestLayer(db))))
    expect(result.id).toBe(7)
    expect(result.remaining).toBe(9)
  })
})
