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
    'src/testing/index',
  ],
  externals: [
    'nitropack',
    'nitropack/runtime',
    'nitro',
    'nitro/runtime',
    'nitro/runtime-config',
    'unimport',
    'graphql',
    'graphql-middleware',
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
  ],
})
