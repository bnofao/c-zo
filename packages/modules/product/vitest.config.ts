import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/*.generated.ts',
        '**/migrations/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.config.ts',
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  }
})

