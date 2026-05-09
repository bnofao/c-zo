import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./manager', () => ({
  useDatabase: vi.fn(async () => ({ __mock: true } as any)),
}))

describe('drizzleDbLive', () => {
  it('exposes the result of useDatabase() via the DrizzleDb tag', async () => {
    const { DrizzleDb, DrizzleDbLive } = await import('./effect')
    const program = Effect.gen(function* () {
      const db = yield* DrizzleDb
      return (db as any).__mock
    })
    const result = await Effect.runPromise(program.pipe(Effect.provide(DrizzleDbLive)))
    expect(result).toBe(true)
  })
})
