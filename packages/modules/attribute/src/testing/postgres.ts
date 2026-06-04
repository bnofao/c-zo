import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { attributeRelations } from '../database/relations'
import * as attributeSchema from '../database/schema'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')

/**
 * A Postgres Testcontainer wrapped as a scoped `DrizzleDb` Layer, pre-bound to
 * the attribute schema, relations, and migrations. A thin wrapper over the
 * reusable `makePostgresTestLayer` from `@czo/kit/testing`. Provide it to a
 * suite via `@effect/vitest`'s `layer()`.
 */
export const AttributePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: attributeRelations(attributeSchema),
})

/** Truncate the attribute tables — call at the top of an `it.effect` for isolation. */
export const truncateAttribute = truncateTables(
  attributeSchema.attributes,
  attributeSchema.attributeValues,
  attributeSchema.attributeSwatchValues,
  attributeSchema.attributeReferenceValues,
  attributeSchema.attributeTextValues,
  attributeSchema.attributeNumericValues,
  attributeSchema.attributeBooleanValues,
  attributeSchema.attributeDateValues,
  attributeSchema.attributeFileValues,
)
