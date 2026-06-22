import { defineConfig } from 'drizzle-kit'
import { discoverModuleSchemas } from '@czo/kit/db'

export default defineConfig({
  // Keep in sync with the module manifest in `src/modules.ts` (dependency
  // order). Every module exposing a `./schema` export must be listed here or
  // its tables get no generated migrations.
  schema: discoverModuleSchemas([
    '@czo/auth',
    '@czo/translation',
    '@czo/attribute',
    '@czo/stock-location',
    '@czo/channel',
    '@czo/price',
    '@czo/inventory',
    '@czo/product',
  ]),
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://czo:czo@localhost:5432/czo_dev',
  },
})
