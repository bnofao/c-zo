import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Alias `@czo/auth/*` to the local `src/` rather than the package's own
// `dist/`. Without this, vitest follows the package.json `exports` "default"
// condition into `dist/`, which causes a dual-class identity problem: a layer
// file imports a Tag / tagged-error class from `@czo/auth/services` and gets
// the *built* class, while the test imports the *source* class — `instanceof`
// checks fail even when runtime behaviour is correct.
export default defineConfig({
  resolve: {
    alias: {
      '@czo/auth/services': resolve(__dirname, 'src/services/index.ts'),
      '@czo/auth/layers': resolve(__dirname, 'src/layers/index.ts'),
      '@czo/auth/graphql': resolve(__dirname, 'src/graphql/index.ts'),
      '@czo/auth/schema': resolve(__dirname, 'src/database/schema.ts'),
      '@czo/auth/relations': resolve(__dirname, 'src/database/relations.ts'),
      '@czo/auth/types': resolve(__dirname, 'src/types.ts'),
      '@czo/kit/email': resolve(__dirname, '../../../packages/kit/src/email/index.ts'),
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
