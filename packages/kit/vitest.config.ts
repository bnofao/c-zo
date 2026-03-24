import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: ['graphql', '@graphql-tools/schema', '@graphql-tools/utils', '@graphql-tools/merge'],
      },
    },
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
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
