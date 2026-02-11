import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/module',
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
    '@czo/kit/db',
    '@czo/kit/config',
    'drizzle-orm',
    'drizzle-orm/pg-core',
  ],
})
