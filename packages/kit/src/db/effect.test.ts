import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

// ── DatabaseConfigFromEnv parsing tests (kept verbatim) ─────────────────────

describe('databaseConfigFromEnv', () => {
  it('parses a single DATABASE_URL into url + empty replicas', async () => {
    const { DatabaseConfig, DatabaseConfigFromEnv } = await import('./effect')

    const program = Effect.gen(function* () {
      const cfg = yield* DatabaseConfig
      return {
        url: Redacted.value(cfg.url),
        replicas: cfg.replicas.length,
        poolMax: cfg.poolMax,
      }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(DatabaseConfigFromEnv),
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ DATABASE_URL: 'postgres://host/db' })),
        ),
      ),
    )

    expect(result).toEqual({ url: 'postgres://host/db', replicas: 0, poolMax: 10 })
  })

  it('parses comma-separated DATABASE_URL into master + replicas', async () => {
    const { DatabaseConfig, DatabaseConfigFromEnv } = await import('./effect')

    const program = Effect.gen(function* () {
      const cfg = yield* DatabaseConfig
      return {
        url: Redacted.value(cfg.url),
        replicas: cfg.replicas.map(r => Redacted.value(r)),
      }
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(DatabaseConfigFromEnv),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              DATABASE_URL: 'postgres://master/db, postgres://replica/db',
            }),
          ),
        ),
      ),
    )

    expect(result).toEqual({
      url: 'postgres://master/db',
      replicas: ['postgres://replica/db'],
    })
  })
})

// ── DrizzleDb live layer test ────────────────────────────────────────────────

const testDbUrl = process.env.TEST_DATABASE_URL

describe('drizzleDbLayer', () => {
  it.skipIf(!testDbUrl)('builds DrizzleDb and executes a trivial query via PgClient', async () => {
    const { DrizzleDb, DrizzleDbLayer, DatabaseConfig } = await import('./effect')
    const { buildSchemaRegistryLayer } = await import('./schema-registry')
    const { sql } = await import('drizzle-orm')

    const TestConfig = Layer.succeed(DatabaseConfig, {
      url: Redacted.make(testDbUrl!),
      replicas: [],
      poolMax: 2,
    })

    const SchemaRegistryLive = buildSchemaRegistryLayer({}, {})

    const program = Effect.gen(function* () {
      const db = yield* DrizzleDb
      const rows = yield* db.execute<{ n: number }>(sql`select 1 as n`)
      return rows[0]?.n
    })

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          DrizzleDbLayer.pipe(
            Layer.provide(Layer.mergeAll(TestConfig, SchemaRegistryLive)),
          ),
        ),
      ),
    )

    expect(result).toBe(1)
  })
})
