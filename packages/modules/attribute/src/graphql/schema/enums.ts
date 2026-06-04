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
    AttributeType: builder.enumType('AttributeType', { values: attributeTypeEnum.enumValues }),
    AttributeUnit: builder.enumType('AttributeUnit', { values: attributeUnitEnum.enumValues }),
  }
}

/** Enum refs created by `registerAttributeEnums`; call only after registration. */
export function attributeEnumRefs(): AttributeEnumRefs {
  if (!refs)
    throw new Error('registerAttributeEnums(builder) must run before attributeEnumRefs()')
  return refs
}
