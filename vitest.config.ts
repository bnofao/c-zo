import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [
          'vitest-package-exports',
          'graphql',
          '@graphql-tools/schema',
          '@graphql-tools/utils',
          '@graphql-tools/merge',
          '@pothos/core',
          '@pothos/plugin-drizzle',
          '@pothos/plugin-relay',
          '@pothos/plugin-errors',
          '@pothos/plugin-scope-auth',
          '@pothos/plugin-zod',
          '@pothos/plugin-tracing',
          'graphql-scalars',
        ],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/old/**',
      '**/.worktrees/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
  },
})
