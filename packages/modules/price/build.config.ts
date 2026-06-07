import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  entries: [
    'src/index',
    'src/database/schema',
    'src/database/relations',
    'src/services/index',
    'src/graphql/index',
  ],
  externals: [
    '@czo/kit',
    '@czo/kit/module',
    '@czo/kit/db',
    '@czo/kit/graphql',
    '@czo/auth',
    '@czo/auth/services',
    '@czo/auth/graphql',
    '@czo/auth/schema',
    'drizzle-orm',
    'drizzle-orm/pg-core',
  ],
})
