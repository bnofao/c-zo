import { defineConfig } from 'drizzle-kit'
import { discoverModuleSchemas } from '@czo/kit/db'

export default defineConfig({
  schema: discoverModuleSchemas(['@czo/auth/module']),
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://czo:czo@localhost:5432/czo_dev',
  },
})
