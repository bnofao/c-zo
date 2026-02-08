import { defineBuildConfig } from 'unbuild'
// import { addRollupTimingsPlugin, stubOptions } from '../../debug/build-config'
const dirImport = {
  addRelativeDeclarationExtensions: true,
  // eslint-disable-next-line node/prefer-global/process
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
    'src/module/index',
    'src/graphql/index',
    'src/db/index',
    'src/cache/index',
    'src/cli',
    {
      input: 'src/plugin/',
      outDir: 'dist/plugin',
      ...dirImport,
    },
  ],
  // stubOptions,
  // hooks: {
  //   'rollup:options' (ctx, options) {
  //     addRollupTimingsPlugin(options)
  //   },
  // },
  externals: [
    'nitropack',
    'nitropack/runtime',
    'nitro',
    'nitro/runtime',
    'unimport',
    'graphql',
    'citty',
    // 'jiti',
    // 'pathe',
  ],
})
