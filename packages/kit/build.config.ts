import { defineBuildConfig } from 'unbuild'
// import { addRollupTimingsPlugin, stubOptions } from '../../debug/build-config'

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/index',
    'src/modules/index',
    {
      input: 'src/plugins/',
      outDir: 'dist/plugins',
      addRelativeDeclarationExtensions: true,
      // eslint-disable-next-line turbo/no-undeclared-env-vars, node/prefer-global/process
      ext: process.env.NODE_ENV === 'development' ? 'ts' : 'js',
      pattern: [
        '**',
        '!**/*.stories.{js,cts,mts,ts,jsx,tsx}', // ignore storybook files
        '!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}', // ignore tests
      ],
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
    'nitro',
    'nitro/runtime',
    'unimport',
  ],
})
