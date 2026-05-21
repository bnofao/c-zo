/**
 * Schema registry — exposes the merged module DB schema + relations to
 * the runtime.
 *
 *  - `SchemaRegistry` Effect Service (preferred). Pre-built from module
 *    contributions via `buildSchemaRegistryLayer`; consumed by
 *    `DrizzleDbLive` to wire the drizzle relations object.
 *  - Legacy globals (`registerSchema`, `registerRelations`, …) — kept
 *    for non-Effect call sites (`seeder.ts`, `drizzle-kit`, legacy
 *    `manager.ts:useDatabase()`).
 */
import type { TablesRelationalConfig } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

/** Shape of the merged module schema map (drizzle tables keyed by name). */
export interface SchemaRegistryShape extends Record<string, unknown> {}

export type RelationsEntry = TablesRelationalConfig
export type RelationsFactory = (schema: SchemaRegistryShape) => RelationsEntry

/* ─── Service ───────────────────────────────────────────────────────── */

export class SchemaRegistry extends Context.Service<SchemaRegistry, {
  readonly schemas: Effect.Effect<SchemaRegistryShape>
  readonly relations: Effect.Effect<RelationsEntry>
}>()('@czo/kit/SchemaRegistry') {}

/** Build the `SchemaRegistry` layer from already-merged values. */
export function buildSchemaRegistryLayer(
  schemas: SchemaRegistryShape,
  relations: RelationsEntry,
): Layer.Layer<SchemaRegistry> {
  return Layer.succeed(SchemaRegistry, SchemaRegistry.of({
    schemas: Effect.succeed(schemas),
    relations: Effect.succeed(relations),
  }))
}

/* ─── Legacy globals (non-Effect call sites) ────────────────────────── */

const schemas: Record<string, unknown>[] = []
const relationsFactories: RelationsFactory[] = []

export function registerSchema(schema: Record<string, unknown>) {
  schemas.push(schema)
}

export function registeredSchemas(): SchemaRegistryShape {
  return Object.assign({}, ...schemas) as SchemaRegistryShape
}

export function registerRelations(factory: RelationsFactory) {
  relationsFactories.push(factory)
}

export function registeredRelations(): RelationsEntry {
  const allSchemas = registeredSchemas()
  return Object.assign({}, ...relationsFactories.map(fn => fn(allSchemas)))
}
