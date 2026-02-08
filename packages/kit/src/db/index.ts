// Re-export existing database utilities
// Note: useDatabase is in the parent db.ts file
export { useDatabase } from './manager'

export type { Database } from './manager'

// Re-export repository builders
export * from './repository'
