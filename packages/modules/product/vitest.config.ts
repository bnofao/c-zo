import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Alias `@czo/product/*` and peer modules to local `src/` rather than each
// package's own `dist/`. Without this, vitest follows the package.json
// `exports` "default" condition into `dist/`, which causes a dual-class
// identity problem. The E2E harness boots the real auth module, so auth's src
// and all the subpaths it imports internally must resolve to one realm.
// Subpath aliases are listed before bare names so rollup's prefix matcher
// resolves them first.
export default defineConfig({
  resolve: {
    alias: {
      '@czo/product/services': resolve(__dirname, 'src/services/index.ts'),
      '@czo/product/graphql': resolve(__dirname, 'src/graphql/index.ts'),
      '@czo/product/schema': resolve(__dirname, 'src/database/schema.ts'),
      '@czo/product/relations': resolve(__dirname, 'src/database/relations.ts'),
      '@czo/auth/services': resolve(__dirname, '../auth/src/services/index.ts'),
      '@czo/auth/graphql': resolve(__dirname, '../auth/src/graphql/index.ts'),
      '@czo/auth/schema': resolve(__dirname, '../auth/src/database/schema.ts'),
      '@czo/auth/relations': resolve(__dirname, '../auth/src/database/relations.ts'),
      '@czo/auth/types': resolve(__dirname, '../auth/src/types.ts'),
      '@czo/price/services': resolve(__dirname, '../price/src/services/index.ts'),
      '@czo/price/schema': resolve(__dirname, '../price/src/database/schema.ts'),
      '@czo/price/relations': resolve(__dirname, '../price/src/database/relations.ts'),
      '@czo/inventory/services': resolve(__dirname, '../inventory/src/services/index.ts'),
      '@czo/inventory/schema': resolve(__dirname, '../inventory/src/database/schema.ts'),
      '@czo/inventory/relations': resolve(__dirname, '../inventory/src/database/relations.ts'),
      '@czo/stock-location/services': resolve(__dirname, '../stock-location/src/services/index.ts'),
      '@czo/stock-location/schema': resolve(__dirname, '../stock-location/src/database/schema.ts'),
      '@czo/stock-location/relations': resolve(__dirname, '../stock-location/src/database/relations.ts'),
      '@czo/channel/services': resolve(__dirname, '../channel/src/services/index.ts'),
      '@czo/channel/schema': resolve(__dirname, '../channel/src/database/schema.ts'),
      '@czo/channel/relations': resolve(__dirname, '../channel/src/database/relations.ts'),
      '@czo/attribute/services': resolve(__dirname, '../attribute/src/services/index.ts'),
      '@czo/attribute/schema': resolve(__dirname, '../attribute/src/database/schema.ts'),
      '@czo/attribute/relations': resolve(__dirname, '../attribute/src/database/relations.ts'),
      '@czo/translation/services': resolve(__dirname, '../translation/src/services/index.ts'),
      '@czo/translation/schema': resolve(__dirname, '../translation/src/database/schema.ts'),
      '@czo/translation/relations': resolve(__dirname, '../translation/src/database/relations.ts'),
      '@czo/translation/graphql': resolve(__dirname, '../translation/src/graphql/index.ts'),
      '@czo/attribute/graphql': resolve(__dirname, '../attribute/src/graphql/index.ts'),
      '@czo/channel/graphql': resolve(__dirname, '../channel/src/graphql/index.ts'),
      '@czo/inventory/graphql': resolve(__dirname, '../inventory/src/graphql/index.ts'),
      '@czo/price/graphql': resolve(__dirname, '../price/src/graphql/index.ts'),
      '@czo/stock-location/graphql': resolve(__dirname, '../stock-location/src/graphql/index.ts'),
      '@czo/kit/email': resolve(__dirname, '../../kit/src/email/index.ts'),
      '@czo/kit/queue': resolve(__dirname, '../../kit/src/queue/index.ts'),
      '@czo/attribute': resolve(__dirname, '../attribute/src/index.ts'),
      '@czo/channel': resolve(__dirname, '../channel/src/index.ts'),
      '@czo/inventory': resolve(__dirname, '../inventory/src/index.ts'),
      '@czo/price': resolve(__dirname, '../price/src/index.ts'),
      '@czo/stock-location': resolve(__dirname, '../stock-location/src/index.ts'),
      '@czo/translation': resolve(__dirname, '../translation/src/index.ts'),
      '@czo/auth': resolve(__dirname, '../auth/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.config.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
