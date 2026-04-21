// Schema discovery for centralized migrations
export { discoverModuleSchemas } from './discover'

export type { DiscoverSchemasOptions } from './discover'

// Re-export new DB helpers
export * from './errors'

// Instrumentation
export { createDbMetrics, createRepositoryInstrumentation } from './instrumentation'

export type { DbMetrics, RepositoryInstrumentationOptions } from './instrumentation'
// Re-export existing database utilities
// Note: useDatabase is in the parent db.ts file
export { useDatabase } from './manager'

export type { Database } from './manager'
export * from './optimistic'
// Schema registry for dynamic module schema registration
export { registeredRelations, registeredSchemas, registerRelations, registerSchema } from './schema-registry'
// NB: repository.ts a été déplacé dans old/ — plus exporté

export type { RelationsEntry, RelationsFactory, SchemaRegistry } from './schema-registry'
export * from './scope'

// Seeder registry for module-level database seeding
export { registeredSeeders, registerSeeder, runSeeder } from './seeder'
export type { RunSeederOptions, SeederConfig } from './seeder'
