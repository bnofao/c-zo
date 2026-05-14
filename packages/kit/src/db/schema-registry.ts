import type { TablesRelationalConfig } from 'drizzle-orm'

export interface SchemaRegistry extends Record<string, unknown> {}

export type RelationsEntry = TablesRelationalConfig
export type RelationsFactory = (schema: SchemaRegistry) => RelationsEntry

const schemas: Record<string, unknown>[] = []
const relationsFactories: RelationsFactory[] = []

export function registerSchema(schema: Record<string, unknown>) {
  schemas.push(schema)
}

export function registeredSchemas(): SchemaRegistry {
  return Object.assign({}, ...schemas) as SchemaRegistry
}

export function registerRelations(factory: RelationsFactory) {
  relationsFactories.push(factory)
}

export function registeredRelations(): RelationsEntry {
  const allSchemas = registeredSchemas()
  return Object.assign({}, ...relationsFactories.map(fn => fn(allSchemas)))
}
