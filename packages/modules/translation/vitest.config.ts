import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Alias `@czo/translation/*` and `@czo/auth/*` to local `src/` rather than
// each package's own `dist/`. Without this, vitest follows the package.json
// `exports` "default" condition into `dist/`, which causes a dual-class
// identity problem. The E2E harness boots the real auth module, so auth's src
// and all the subpaths it imports internally must resolve to one realm.
// Subpath aliases are listed before bare names so rollup's prefix matcher
// resolves them first.
export default defineConfig({
  resolve: {
    alias: {
      '@czo/translation/services': resolve(__dirname, 'src/services/index.ts'),
      '@czo/translation/graphql': resolve(__dirname, 'src/graphql/index.ts'),
      '@czo/translation/schema': resolve(__dirname, 'src/database/schema.ts'),
      '@czo/translation/relations': resolve(__dirname, 'src/database/relations.ts'),
      '@czo/auth/services': resolve(__dirname, '../auth/src/services/index.ts'),
      '@czo/auth/graphql': resolve(__dirname, '../auth/src/graphql/index.ts'),
      '@czo/auth/schema': resolve(__dirname, '../auth/src/database/schema.ts'),
      '@czo/auth/relations': resolve(__dirname, '../auth/src/database/relations.ts'),
      '@czo/auth/types': resolve(__dirname, '../auth/src/types.ts'),
      '@czo/kit/email': resolve(__dirname, '../../kit/src/email/index.ts'),
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
