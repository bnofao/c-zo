import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { DrizzleDb } from '../db'
import { makePostgresTestLayer } from '../testing'
import { buildRuntime } from './app'

// A trivial module that depends on DrizzleDb proves the runtime resolves it.
const probe = {
  name: 'probe' as const,
  version: '0.0.0',
  layer: Layer.empty,
}

it('buildRuntime composes a runtime that resolves DrizzleDb', async () => {
  const db = makePostgresTestLayer({})
  const { runtimeLayer } = buildRuntime({ modules: [probe], db })
  const ok = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const drizzle = yield* DrizzleDb
        return drizzle != null
      }).pipe(Effect.provide(runtimeLayer)),
    ),
  )
  expect(ok).toBe(true)
}, 120_000)
