import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'src/graphql/admin.graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/graphql/gen/**'],
  ignoreNoDocuments: true,
  generates: {
    './src/graphql/gen/': {
      preset: 'client',
      // `documentMode: 'string'` makes `graphql()` return a `TypedDocumentString`
      // whose `.toString()` is the raw query — required by the fetch-based
      // `gqlAdmin` helper (a DocumentNode AST would serialize to "[object Object]").
      config: {
        documentMode: 'string',
        scalars: {
          DateTime: 'string',
          JSON: 'unknown',
          JSONObject: 'Record<string, unknown>',
        },
      },
    },
  },
}

export default config
