// Attribute module — GraphQL enums.
//
// `AttributeType` / `AttributeUnit` mirror the Postgres enums declared in
// `database/schema.ts` (`attributeTypeEnum`, `attributeUnitEnum`). The enum
// `values` arrays are derived from the Drizzle enum so the GraphQL surface can
// never drift from the DB definition.
//
// The created enum refs are stashed for `types.ts` to reference (Pothos enums
// are referenced by their ref object, not by a string type name).

import type { AttributeGraphQLSchemaBuilder } from '..'
import { attributeTypeEnum, attributeUnitEnum } from '../../database/schema'

type AttributeType = (typeof attributeTypeEnum.enumValues)[number]
type AttributeUnit = (typeof attributeUnitEnum.enumValues)[number]

export interface AttributeEnumRefs {
  AttributeType: ReturnType<AttributeGraphQLSchemaBuilder['enumType']> & { __type?: AttributeType }
  AttributeUnit: ReturnType<AttributeGraphQLSchemaBuilder['enumType']> & { __type?: AttributeUnit }
}

let refs: AttributeEnumRefs | undefined

export function registerAttributeEnums(builder: AttributeGraphQLSchemaBuilder): void {
  refs = {
    AttributeType: builder.enumType('AttributeType', {
      subGraphs: ['org', 'admin'],
      description: 'The kind of an attribute. Choice types (DROPDOWN, MULTISELECT, SWATCH, REFERENCE) carry a list of catalog values; the rest (TEXT, NUMBER, BOOLEAN, DATE, DATETIME, FILE) carry a single typed value.',
      values: attributeTypeEnum.enumValues,
    }),
    AttributeUnit: builder.enumType('AttributeUnit', {
      subGraphs: ['org', 'admin'],
      description: 'The unit of measure for a NUMBER attribute (e.g. weight, length, volume); null for non-numeric attributes.',
      values: attributeUnitEnum.enumValues,
    }),
  }
}

/** Enum refs created by `registerAttributeEnums`; call only after registration. */
export function attributeEnumRefs(): AttributeEnumRefs {
  if (!refs)
    throw new Error('registerAttributeEnums(builder) must run before attributeEnumRefs()')
  return refs
}
