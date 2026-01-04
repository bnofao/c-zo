import type { NodePgClient } from 'drizzle-orm/node-postgres'
import type { DrizzleConfig } from 'drizzle-orm/utils'
import type { Pool } from 'pg'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { withReplicas } from 'drizzle-orm/pg-core'

// let db: Kysely<any> | null = null

/**
 * Get or create the database connection singleton
 * @returns Kysely database instance
 */
// export function useDatabase<DB>(): Kysely<DB> {
//   if (!db) {
//     db = new Kysely<DB>({
//       dialect: new PostgresDialect({
//         pool: new Pool({
//           connectionString: process.env.DATABASE_URL,
//           max: 20,
//           idleTimeoutMillis: 30000,
//           connectionTimeoutMillis: 2000,
//         }),
//       }),
//       log: process.env.NODE_ENV === 'development'
//         ? (event) => {
//             if (event.level === 'query') {
//               console.log('SQL:', event.query.sql)
//               console.log('Parameters:', event.query.parameters)
//             }
//           }
//         : undefined,
//     })
//   }
//   return db
// }

/**
 * Close the database connection
 */
// export async function closeDatabase(): Promise<void> {
//   if (db) {
//     await db.destroy()
//     db = null
//   }
// }

// eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix
export function useDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>): ReturnType<typeof createDatabase<TSchema, TClient>> {
  if (config) {
    return ((useDatabase as any).__instance__ = createDatabase<TSchema, TClient>(config))
  }
  return ((useDatabase as any).__instance__ ??= createDatabase<TSchema, TClient>())
}

function createDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
  TClient extends NodePgClient = Pool,
>(config?: DrizzleConfig<TSchema>) {
  const connections = process.env.DATABASE_URL?.split(',') ?? []
  const master = connections[0]
  const replicas = connections.slice(1)

  if (!master) {
    throw new Error('DATABASE_URL is not set')
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
