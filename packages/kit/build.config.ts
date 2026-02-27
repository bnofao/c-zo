import { defineBuildConfig } from 'unbuild'
// import { addRollupTimingsPlugin, stubOptions } from '../../debug/build-config'
const _dirImport = {
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
    'src/index',
    'src/module/index',
    'src/graphql/index',
    'src/db/index',
    'src/ioc/index',
    'src/cache/index',
    'src/event-bus/index',
    'src/telemetry/index',
    'src/queue/index',
    'src/nitro/index',
    'src/plugins/index',
    // {
    //   input: 'src/module/',
    //   outDir: 'dist/module',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/db/',
    //   outDir: 'dist/db',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/cache/',
    //   outDir: 'dist/cache',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/event-bus/',
    //   outDir: 'dist/event-bus',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/telemetry/',
    //   outDir: 'dist/telemetry',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/queue/',
    //   outDir: 'dist/queue',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/ioc/',
    //   outDir: 'dist/ioc',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/nitro/',
    //   outDir: 'dist/nitro',
    //   ...dirImport,
    // },
    // {
    //   input: 'src/plugin/',
    //   outDir: 'dist/plugin',
    //   ...dirImport,
    // },
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
    'nitro/runtime-config',
    'unimport',
    'graphql',
    '@graphql-tools/utils',
    '@opentelemetry/api',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/semantic-conventions',
    '@opentelemetry/api-logs',
    'amqplib',
    'bullmq',
    'ioredis',
    'citty',
    // 'jiti',
    // 'pathe',
  ],
})
