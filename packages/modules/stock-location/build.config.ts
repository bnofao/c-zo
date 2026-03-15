import { defineBuildConfig } from 'unbuild'

const dirImport = {
  addRelativeDeclarationExtensions: true,
  // eslint-disable-next-line node/prefer-global/process
  ext: process.env.NODE_ENV === 'development' ? 'ts' : 'js',
  pattern: [
    '**',
    '!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}',
  ],
}

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/module',
    'src/types',
    'src/database/schema',
    'src/database/relations',
    'src/events/index',
    'src/services/index',
    'src/graphql/index',
    {
      input: 'src/plugins/',
      outDir: 'dist/plugins',
      ...dirImport,
    },
  ],
  externals: [
    'nitropack',
    'nitropack/runtime',
    'nitro',
    'nitro/runtime',
    'nitro/runtime-config',
    '@czo/kit',
    '@czo/kit/nitro',
    '@czo/kit/db',
    '@czo/kit/ioc',
    '@czo/kit/event-bus',
    '@czo/kit/graphql',
    'drizzle-orm',
    'drizzle-orm/pg-core',
    'graphql',
    'graphql-scalars',
    '@graphql-tools/resolvers-composition',
  ],
})
