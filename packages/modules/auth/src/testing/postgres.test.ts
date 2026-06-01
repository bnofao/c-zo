import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AuthPostgresLayer } from './postgres'

layer(AuthPostgresLayer, { timeout: 120_000 })('AuthPostgresLayer', (it) => {
  it.effect('boots a container with the auth schema applied', () =>
    Effect.gen(function* () {
      const db = yield* DrizzleDb
      // db.execute returns Effect<readonly Record<string, unknown>[]> in
      // effect-postgres (rows are the result directly, no .rows wrapper)
      const rows = yield* db.execute<{ table_name: string }>(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      )
      const names = rows.map(r => r.table_name)
      expect(names).toContain('users')
      expect(names).toContain('sessions')
      expect(names).toContain('accounts')
    }))
})
