import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Alias `@czo/stock-location/*` to the local `src/` rather than the package's
// own `dist/`. Without this, vitest follows the package.json `exports`
// "default" condition into `dist/`, which causes a dual-class identity problem.
export default defineConfig({
  resolve: {
    alias: {
      '@czo/stock-location/services': resolve(__dirname, 'src/services/index.ts'),
      '@czo/stock-location/graphql': resolve(__dirname, 'src/graphql/index.ts'),
      '@czo/stock-location/schema': resolve(__dirname, 'src/database/schema.ts'),
      '@czo/stock-location/relations': resolve(__dirname, 'src/database/relations.ts'),
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
