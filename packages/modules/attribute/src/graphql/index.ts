import type { Relations } from '@czo/attribute/relations'
// `Attribute`, `AttributeValue`, `TypedValue` are namespaces in `services/index`;
// the row shapes live as members (e.g. `Attribute.Attribute`).
import type { Attribute, AttributeValue, TypedValue } from '@czo/attribute/services'
import type { BooleanFilter, DateTimeFilter, OrderByInput, SchemaBuilder, StringFilter } from '@czo/kit/graphql'
import type { AttributeAssignment } from './schema/assigned'
import type { AttributeTypeFilter, AttributeUnitFilter } from './schema/inputs'
import type { FileInfo } from './schema/scalars'
// Pull in auth's module augmentation so cross-module ctx slices (`ctx.auth`)
// and object refs (e.g. `'Organization'`) resolve against the shared interfaces.
import '@czo/auth/graphql'

export { assignedAttributeField, assignedAttributesField } from './assigned-field'
export { attributeNodeGuards } from './node-guards'
export { type AttributeBuilder, registerAttributeSchema } from './schema'
export type { AnyAssignment, AttributeAssignment } from './schema/assigned'

export type AttributeGraphQLSchemaBuilder = SchemaBuilder<Relations>

export interface AttributeWhereInput {
  name?: StringFilter | null
  slug?: StringFilter | null
  referenceEntity?: StringFilter | null
  isRequired?: BooleanFilter | null
  isFilterable?: BooleanFilter | null
  type?: AttributeTypeFilter | null
  unit?: AttributeUnitFilter | null
  createdAt?: DateTimeFilter | null
  updatedAt?: DateTimeFilter | null
  AND?: AttributeWhereInput[] | null
  OR?: AttributeWhereInput[] | null
  NOT?: AttributeWhereInput | null
}

declare module '@czo/kit/graphql' {
  interface BuilderSchemaObjects {
    Attribute: Attribute.Attribute
    AssignedAttribute: AttributeAssignment
    AttributeValue: AttributeValue.AttributeValue
    AttributeSwatchValue: AttributeValue.AttributeSwatchValue
    AttributeReferenceValue: AttributeValue.AttributeReferenceValue
    AttributeTextValue: TypedValue.AttributeTextValue
    AttributeNumericValue: TypedValue.AttributeNumericValue
    AttributeBooleanValue: TypedValue.AttributeBooleanValue
    AttributeDateValue: TypedValue.AttributeDateValue
    AttributeFileValue: TypedValue.AttributeFileValue
    FileInfo: FileInfo
  }

  interface BuilderSchemaInputs {
    AttributeWhereInput: AttributeWhereInput
    AttributeTypeFilterInput: AttributeTypeFilter
    AttributeUnitFilterInput: AttributeUnitFilter
    AttributeOrderByInput: OrderByInput<'name' | 'slug' | 'createdAt' | 'updatedAt'>
    FileInfoInput: FileInfo
  }

  // The attribute module reuses auth's `permission` / `auth` scopes (declared by
  // `@czo/auth/graphql`, imported above) for BOTH tiers: org resources use
  // `permission` with an `organization`; platform resources use `permission`
  // without one (checked against the caller's global role). No module-local
  // scope is needed.
}
