import type { NodePgClient } from 'drizzle-orm/node-postgres'
import type { DrizzleConfig } from 'drizzle-orm/utils'
import type { Pool } from 'pg'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core'
import { useCzoConfig } from '../config'

export type Database<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
> = ReturnType<typeof createDatabase<TSchema, TClient>>

export function useDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>): Database<TSchema, TClient> {
  if (config) {
    return ((useDatabase as any).__instance__ = createDatabase<TSchema, TClient>(config))
  }
  return ((useDatabase as any).__instance__ ??= createDatabase<TSchema, TClient>())
}

function createDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>) {
  const { databaseUrl } = useCzoConfig()
  const connections = databaseUrl?.split(',') ?? []
  const master = connections[0]
  const replicas = connections.slice(1)

  if (!master) {
    throw new Error(
      'Database URL is required. '
      + 'Set NITRO_CZO_DATABASE_URL or configure runtimeConfig.czo.databaseUrl',
    )
  }

  // @ts-expect-error config must be undefined
  const masterDb = drizzleNodePg<TSchema, TClient>(master, config)

  if (replicas.length > 0) {
    // @ts-expect-error config must be undefined
    const replicasDb = replicas.map(url => drizzleNodePg<TSchema, TClient>(url, config))
    return withReplicas(masterDb, <any> replicasDb)
  }

  return masterDb
}
