import type { NodePgClient } from 'drizzle-orm/node-postgres'
import type { DrizzleConfig } from 'drizzle-orm/utils'
import type { Pool } from 'pg'
import process from 'node:process'
import { useContainer } from '@czo/kit/ioc'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core'

export type Database<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
> = Awaited<ReturnType<typeof createDatabase<TSchema, TClient>>>

export async function useDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>): Promise<Database<TSchema, TClient>> {
  if (config) {
    return ((useDatabase as any).__instance__ = await createDatabase<TSchema, TClient>(config))
  }
  return ((useDatabase as any).__instance__ ??= await createDatabase<TSchema, TClient>())
}

async function getDatabaseUrl() {
  try {
    const config = await useContainer().make('config')
    const url = config.database?.url

    if (url)
      return url
  }
  catch {
    const url = process.env.DATABASE_URL
    if (url)
      return url
  }

  throw new Error(
    'Database URL is required. '
    + 'Set DATABASE_URL or configure runtimeConfig.database.url',
  )
}

async function createDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>) {
  const databaseUrl = await getDatabaseUrl()
  const connections = databaseUrl?.split(',') ?? []
  const master = connections[0]
  const replicas = connections.slice(1)

  // @ts-expect-error config must be undefined
  const masterDb = drizzleNodePg<TSchema, TClient>(master, config)

  if (replicas.length > 0) {
    // @ts-expect-error config must be undefined
    const replicasDb = replicas.map(url => drizzleNodePg<TSchema, TClient>(url, config))
    return withReplicas(masterDb, <any> replicasDb)
  }

  return masterDb
}
