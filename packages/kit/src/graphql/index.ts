export * from './builder'
export * from './errors'
export * from './sdl'
export * from './subscription'

// Re-export relay connection helpers so modules can resolve in-memory / custom
// (non-drizzle) connections without taking a direct `@pothos/plugin-relay`
// dependency — the kit owns the relay plugin and its configuration.
export { resolveArrayConnection, resolveOffsetConnection } from '@pothos/plugin-relay'
