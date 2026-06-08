import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

type TranslationSchema = Pick<SchemaRegistryShape, 'locales'>

export function translationRelations(schema: TranslationSchema) {
  const { locales } = schema
  // locales has no outgoing relations; declare the table with an empty relation set.
  return defineRelationsPart({ locales }, () => ({ locales: {} }))
}

export type Relations = ReturnType<typeof translationRelations>
