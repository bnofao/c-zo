import { defineBuildConfig } from 'unbuild'
// import { addRollupTimingsPlugin, stubOptions } from '../../debug/build-config'

const dirImport = {
  // addRelativeDeclarationExtensions: true,
  // eslint-disable-next-line turbo/no-undeclared-env-vars, node/prefer-global/process
  ext: process.env.NODE_ENV === 'development' ? 'ts' : 'js',
  pattern: [
    '**',
    '!**/*.stories.{js,cts,mts,ts,jsx,tsx}', // ignore storybook files
    '!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}', // ignore tests
  ],
}

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/index',
    'src/utils/index',
    'src/database/index',
    'src/services/index',
    'src/validators/index',
    {
      input: 'src/plugins/',
      outDir: 'dist/plugins',
      ...dirImport
    },
    {
      input: 'src/schema/',
      outDir: 'dist/schema',
      ...dirImport
    },
    {
      input: 'migrations/',
      outDir: 'dist/migrations',
      ...dirImport
    },
    {
      input: 'src/services/',
      outDir: 'dist/services',
      ...dirImport
    },
  ],
  outDir: 'dist',
  // stubOptions,
  // hooks: {
  //   'rollup:options' (ctx, options) {
  //     addRollupTimingsPlugin(options)
  //   },
  // },
  externals: [
    '@czo/kit',
    'nitro',
    'nitro/runtime',
    'unimport',
    'graphql',
  ],
})
