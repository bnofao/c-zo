import type { StartedTestContainer } from 'testcontainers'
import type { Database } from '../src/database/types'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from 'kysely'
import { TSFileMigrationProvider } from 'kysely-ctl'
import { Pool } from 'pg'
import { GenericContainer } from 'testcontainers'
import { afterAll, beforeAll } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let postgresContainer: StartedTestContainer
let testDb: Kysely<Database>

/**
 * Run all migrations for the test database
 */
async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new TSFileMigrationProvider({
      migrationFolder: path.join(__dirname, '../migrations'),
    }),
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`Migration "${it.migrationName}" was executed successfully`)
    }
    else if (it.status === 'Error') {
      console.error(`Failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('Failed to migrate')
    console.error(error)
    throw error
  }
}

beforeAll(async () => {
  // Start PostgreSQL test container
  postgresContainer = await new GenericContainer('postgres:14')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_DB: 'test',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
    })
    .start()

  const host = postgresContainer.getHost()
  const port = postgresContainer.getMappedPort(5432)

  // Create test database connection
  testDb = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        host,
        port,
        database: 'test',
        user: 'test',
        password: 'test',
      }),
    }),
  })

  // Run all migrations
  await migrateToLatest(testDb)
}, 60000)

afterAll(async () => {
  if (testDb) {
    await testDb.destroy()
  }
  if (postgresContainer) {
    await postgresContainer.stop()
  }
})

export { testDb }
