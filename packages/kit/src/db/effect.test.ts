import { Layer, Effect, Redacted } from 'effect'
import { describe, expect, it, vi } from 'vitest'

// Mock pg so the test doesn't need an actual database — `pg.Pool` and the
// drizzle adapter just see a no-op client.
vi.mock('pg', () => {
  const fakePool = { end: vi.fn().mockResolvedValue(undefined) }
  return { default: { Pool: vi.fn().mockReturnValue(fakePool) } }
})

// Mock drizzleNodePg to bypass the real adapter and return a sentinel we
// can read back through the Tag.
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ __mock: true })),
}))

describe('drizzleDbLive', () => {
  it('exposes a drizzle instance via the DrizzleDb tag when DatabaseConfig is provided', async () => {
    const { DrizzleDb, DrizzleDbLayer: DrizzleDbLive, DatabaseConfig } = await import('./effect')
    const { SchemaRegistryLayer: SchemaRegistryLive } = await import('./schema-registry')

    const TestConfig = Layer.succeed(DatabaseConfig, {
      url: Redacted.make('postgres://test'),
      replicas: [],
      poolMax: 10,
    })

    const program = Effect.gen(function* () {
      const db = yield* DrizzleDb
      return (db as any).__mock
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          DrizzleDbLive.pipe(
            Layer.provide(Layer.mergeAll(TestConfig, SchemaRegistryLive)),
          ),
        ),
      ),
    )
    expect(result).toBe(true)
  })
})
