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
    'src/email/index',
    'src/openapi/index',
    'src/graphql/index',
    'src/db/index',
    'src/ratelimit/index',
    'src/testing/index',
  ],
  externals: [
    'unimport',
    // Test-only dep used by `src/testing/*`; a devDep, so unbuild won't
    // auto-externalize it. Keep it external — `@czo/kit/testing` is only
    // ever imported from test suites, where the dep is present.
    '@testcontainers/postgresql',
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
    // Types-only dep used via `import type` in `src/openapi/*`; keep it
    // external so unbuild emits the type reference instead of bundling.
    'openapi-types',
  ],
})
