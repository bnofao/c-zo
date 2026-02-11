import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // eslint-disable-next-line node/prefer-global/process
    url: process.env.DATABASE_URL || 'postgresql://czo:czo@localhost:5432/czo_dev',
  },
})
