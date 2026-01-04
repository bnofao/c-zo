import { CamelCasePlugin, PostgresDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import { Pool } from 'pg'

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    })
  }),
  migrations: {
    migrationFolder: './migrations'
  },
  plugins: [
    new CamelCasePlugin()
  ]
})

