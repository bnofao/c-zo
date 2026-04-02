import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ['vitest-package-exports', 'graphql', '@graphql-tools/schema', '@graphql-tools/utils', '@graphql-tools/merge'],
      },
    },
  },
})
