import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { DrizzleDb } from '@czo/kit/db/effect'
import { describe, expect, it, layer } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AuthPostgresLayer } from './postgres'

layer(AuthPostgresLayer, { timeout: 120_000 })('AuthPostgresLayer', (it) => {
  it.effect('boots a container with the auth schema applied', () =>
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const res = yield* Effect.promise(() => db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      ))
      const names = (res.rows as { table_name: string }[]).map(r => r.table_name)
      expect(names).toContain('users')
      expect(names).toContain('sessions')
      expect(names).toContain('accounts')
    }))
})
