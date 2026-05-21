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
  // `.d.ts` generation disabled: `package.json` `exports.types` points
  // directly to `src/*.ts`, so consumers never read dist declarations.
  // Generating them via rollup-plugin-dts blows past 4 GB of heap because
  // each entry rebuilds a fresh TS program over the full
  // better-auth + drizzle + effect + pothos type graph (~13 entries × huge
  // graph = quadratic memory). See investigation in commit message.
  declaration: false,
  entries: [
    'src/module',
    'src/types',
    // 'src/config/index',
    'src/database/schema',
    'src/database/relations',
    // 'src/listeners/index',
    'src/services/index',
    'src/layers/index',
    'src/graphql/index',
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
      input: 'src/middleware/',
      outDir: 'dist/middleware',
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
    '@czo/kit/nitro',
    '@czo/kit/db',
    '@czo/kit/db/effect',
    '@czo/kit/event-bus',
    'drizzle-orm',
    'drizzle-orm/pg-core',
    'nitro/storage',
    'better-auth/crypto',
    'better-auth/plugins/access',
    '@czo/kit/graphql',
    'graphql',
    'graphql-scalars',
    '@graphql-tools/resolvers-composition',
    // Effect's type graph is huge — inlining its `.d.ts` across all entries
    // drives unbuild's rollup-plugin-dts pass past 4 GB of heap. Consumers
    // (mazo, kit) already depend on `effect` directly, so externalising here
    // doesn't break them.
    'effect',
  ],
})
