import type { Database } from './types'
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

let db: Kysely<Database> | null = null

/**
 * Get or create the database connection singleton
 * @returns Kysely database instance
 */
export function getDatabase(): Kysely<Database> {
  if (!db) {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        }),
      }),
      log: process.env.NODE_ENV === 'development'
        ? (event) => {
            if (event.level === 'query') {
              console.log('SQL:', event.query.sql)
              console.log('Parameters:', event.query.parameters)
            }
          }
        : undefined,
    })
  }
  return db
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy()
    db = null
  }
}
