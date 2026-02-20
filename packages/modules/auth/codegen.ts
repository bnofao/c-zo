import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: [
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
      fixObjectTypeResolvers: 'disabled',
      scalarsOverrides: {
        DateTime: { type: 'Date | string' },
        EmailAddress: { type: 'string' },
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
