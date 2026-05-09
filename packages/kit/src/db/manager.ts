import type { AnyRelations, DrizzleConfig, EmptyRelations } from 'drizzle-orm'
import type { RelationsEntry, SchemaRegistry } from './schema-registry'
import process from 'node:process'
import { useContainer } from '@czo/kit/ioc'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core'
import { registeredRelations } from './schema-registry'

export type Database<Relations extends RelationsEntry = RelationsEntry> = Awaited<ReturnType<typeof createDatabase<Relations>>>

export async function useDatabase<Relations extends RelationsEntry = RelationsEntry>(config?: DrizzleConfig<SchemaRegistry, Relations>)/* : Promise<Database<TSchema, TRelationConfigs>> */ {
  if (config) {
    return ((useDatabase as any).__instance__ = await createDatabase(config))
  }
  return ((useDatabase as any).__instance__ ??= await createDatabase(autoSchemaConfig/* <TSchema, TRelationConfigs> */()))
}

function autoSchemaConfig/* <TSchema extends Record<string, unknown>, TRelationConfigs extends AnyRelations = EmptyRelations> */()/* : DrizzleConfig<TSchema, TRelationConfigs> | undefined  */ {
  const mergedRelations = registeredRelations()
  const hasRelations = Object.keys(mergedRelations).length > 0

  if (!hasRelations)
    return undefined

  // RQBv2: only relations are needed for db.query[model].findFirst/findMany.
  // Schemas are still registered (for drizzle-kit) but not passed to drizzle().
  return {
    relations: mergedRelations,
  } /* as DrizzleConfig<TSchema, TRelationConfigs> */
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

async function createDatabase<Relations extends RelationsEntry = RelationsEntry>(config?: DrizzleConfig<SchemaRegistry, Relations>) {
  const databaseUrl = await getDatabaseUrl()
  const connections = databaseUrl?.split(',') ?? []
  const master = connections[0] as string
  const replicas = connections.slice(1)

  const connect = (url: string) =>
    config ? drizzleNodePg(url, config) : drizzleNodePg(url, {} as DrizzleConfig<SchemaRegistry, Relations>)

  const masterDb = connect(master)

  if (replicas.length > 0) {
    const replicasDb = replicas.map(connect)
    return withReplicas(masterDb, replicasDb as [typeof masterDb, ...typeof masterDb[]])
  }

  return masterDb
}
