import { ConfigProvider, Effect, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

// ── DatabaseConfigFromEnv parsing tests (kept verbatim) ─────────────────────

describe('databaseConfigFromEnv', () => {
  it('parses a single DATABASE_URL into url + empty replicas', async () => {
    const { DatabaseConfig, DatabaseConfigFromEnv } = await import('./')

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
    const { DatabaseConfig, DatabaseConfigFromEnv } = await import('./')

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

// The live `DrizzleDbLayer` is exercised end-to-end against a real Postgres
// container in `drizzle-layer.integration.test.ts`.
