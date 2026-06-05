import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `@czo/app` is a broken orphan (kit-v2 restructure) — excluded from the
    // root test run until it's migrated or deleted.
    projects: ['packages/kit', 'packages/modules/*', '!packages/modules/app'],
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
          '@pothos/plugin-validation',
          '@pothos/plugin-tracing',
          '@pothos/plugin-directives',
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
