import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { authRelations } from '../database/relations'
import * as authSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer, pre-bound to
 * the auth schema, relations, and migrations. A thin wrapper over the reusable
 * `makePostgresTestLayer` from `@czo/kit/testing`. Provide it to a suite via
 * `@effect/vitest`'s `layer()`.
 */
export const AuthPostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: authRelations(authSchema),
})

/** Truncate the auth tables — call at the top of an `it.effect` for isolation. */
export const truncateAuth = truncateTables(
  authSchema.accounts,
  authSchema.sessions,
  authSchema.users,
  authSchema.verifications,
)
