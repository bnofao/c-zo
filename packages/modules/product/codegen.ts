import type { CodegenConfig } from '@graphql-codegen/cli'
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: '**/schema.gql',
  generates: {
    'src/schema': defineConfig({
      resolverTypesPath: './types.generated.ts',
      typeDefsFilePath: './typeDefs.generated.ts',
      resolverMainFile: './resolvers.generated.ts',
      scalarsModule: './common/scalars',
    })
  }
}

export default config