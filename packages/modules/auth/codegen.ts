import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'src/graphql/schema/*.graphql',
  generates: {
    'src/graphql/__generated__/resolver-types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../../types#GraphQLContext',
        useIndexSignature: true,
        scalars: {
          DateTime: 'Date | string',
          EmailAddress: 'string',
        },
      },
    },
  },
}

export default config
