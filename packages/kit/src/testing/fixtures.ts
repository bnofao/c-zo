import type { AnyTable } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import process from 'node:process'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

// eslint-disable-next-line turbo/no-undeclared-env-vars
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@localhost:5432/czo_test'

let cachedDb: NodePgDatabase | null = null

export function createTestDb(): NodePgDatabase {
  if (cachedDb)
    return cachedDb
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  cachedDb = drizzle({ client: pool })
  return cachedDb
}

export async function truncate(db: NodePgDatabase, ...tables: AnyTable<any>[]): Promise<void> {
  for (const table of tables) {
    await db.execute(sql`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
  }
}
