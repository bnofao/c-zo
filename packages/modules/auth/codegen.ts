import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: [
    '../../kit/src/graphql/base-types.graphql',
    '../../kit/src/graphql/filter-types.graphql',
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
        'Query._empty': './../../../../../kit/src/graphql/resolvers/Query/_empty#_empty as Query__empty',
        'Mutation._empty': './../../../../../kit/src/graphql/resolvers/Mutation/_empty#_empty as Mutation__empty',
      },
      fixObjectTypeResolvers: 'disabled',
      scalarsOverrides: {
        DateTime: { type: 'Date | string' },
        EmailAddress: { type: 'string' },
        JSON: { type: 'Record<string, unknown> | null' },
      },
      typesPluginsConfig: {
        contextType: '../../types#GraphQLContext',
        useIndexSignature: true,
        mappers: {
          User: 'better-auth/plugins#UserWithRole',
        },
      },
    }),
  },
}

export default config
