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
    {
      input: 'src/plugins/',
      outDir: 'dist/plugins',
      ...dirImport,
    },
    {
      input: 'src/routes/',
      outDir: 'dist/routes',
      ...dirImport,
    },
    {
      input: 'src/config/',
      outDir: 'dist/config',
      ...dirImport,
    },
    {
      input: 'src/database/',
      outDir: 'dist/database',
      ...dirImport,
    },
    {
      input: 'src/services/',
      outDir: 'dist/services',
      ...dirImport,
    },
  ],
  externals: [
    'nitropack',
    'nitropack/runtime',
    'nitro',
    'nitro/runtime',
    'nitro/runtime-config',
    'better-auth',
    'better-auth/plugins',
    'better-auth/adapters/drizzle',
    '@czo/kit',
    '@czo/kit/author',
    '@czo/kit/db',
    '@czo/kit/config',
    'drizzle-orm',
    'drizzle-orm/pg-core',
    'ioredis',
    'better-auth/crypto',
    'graphql',
  ],
})
