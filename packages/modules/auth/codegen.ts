import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: [
    '../../kit/src/graphql/filter-types.graphql',
    '../../kit/src/graphql/relay/relay-types.graphql',
    'src/graphql/schema/**/*.graphql',
  ],
  generates: {
    'src/graphql/': defineConfig({
      mode: 'modules',
      resolverTypesPath: './__generated__/types.generated.ts',
      typeDefsFilePath: './__generated__/typedefs.generated.ts',
      resolverMainFile: './__generated__/resolvers.generated.ts',
      resolverGeneration: 'minimal',
      externalResolvers: {
      },
      fixObjectTypeResolvers: 'disabled',
      scalarsOverrides: {
        JSON: { type: 'Record<string, unknown> | null' },
      },
      typesPluginsConfig: {
        contextType: '../../types#GraphQLContext',
        useIndexSignature: true,
        mappers: {
          User: 'better-auth/plugins#UserWithRole',
          App: '../../services/app.service#AppRow',
        },
      },
    }),
  },
}

export default config
