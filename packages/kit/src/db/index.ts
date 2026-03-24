// Schema discovery for centralized migrations
export { discoverModuleSchemas } from './discover'

export type { DiscoverSchemasOptions } from './discover'

// Filters for GraphQL where inputs
export { applyGlobalIdFilter, applyStringFilter } from './filters'
export type { GlobalIDFilterInput, StringFilterInput } from './filters'

// Instrumentation
export { createDbMetrics, createRepositoryInstrumentation } from './instrumentation'

export type { DbMetrics, RepositoryInstrumentationOptions } from './instrumentation'

// Re-export existing database utilities
// Note: useDatabase is in the parent db.ts file
export { useDatabase } from './manager'
export type { Database } from './manager'

// Re-export repository builders
export * from './repository'

// Schema registry for dynamic module schema registration
export { registeredRelations, registeredSchemas, registerRelations, registerSchema } from './schema-registry'
export type { RelationsEntry, RelationsFactory, SchemaRegistry } from './schema-registry'
