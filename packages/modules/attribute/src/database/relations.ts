import type { SchemaRegistryShape } from '@czo/kit/db'
import { defineRelationsPart } from 'drizzle-orm'

// Accept only the attribute tables, not the whole `SchemaRegistryShape`: once a
// sibling module (e.g. `@czo/auth`) augments the registry with its own tables,
// the module-local `schema` object no longer satisfies the full shape. Picking
// the keys this part actually uses keeps callers (testing layer) valid.
type AttributeSchema = Pick<
  SchemaRegistryShape,
  | 'attributes'
  | 'attributeValues'
  | 'attributeSwatchValues'
  | 'attributeReferenceValues'
  | 'attributeTextValues'
  | 'attributeNumericValues'
  | 'attributeBooleanValues'
  | 'attributeDateValues'
  | 'attributeFileValues'
>

export function attributeRelations(schema: AttributeSchema) {
  const {
    attributes,
    attributeValues,
    attributeSwatchValues,
    attributeReferenceValues,
    attributeTextValues,
    attributeNumericValues,
    attributeBooleanValues,
    attributeDateValues,
    attributeFileValues,
  } = schema

  return defineRelationsPart(
    {
      attributes,
      attributeValues,
      attributeSwatchValues,
      attributeReferenceValues,
      attributeTextValues,
      attributeNumericValues,
      attributeBooleanValues,
      attributeDateValues,
      attributeFileValues,
    },
    r => ({
      attributes: {
        values: r.many.attributeValues({ from: r.attributes.id, to: r.attributeValues.attributeId }),
        swatchValues: r.many.attributeSwatchValues({ from: r.attributes.id, to: r.attributeSwatchValues.attributeId }),
        referenceValues: r.many.attributeReferenceValues({ from: r.attributes.id, to: r.attributeReferenceValues.attributeId }),
      },
      attributeValues: { attribute: r.one.attributes({ from: r.attributeValues.attributeId, to: r.attributes.id }) },
      attributeSwatchValues: { attribute: r.one.attributes({ from: r.attributeSwatchValues.attributeId, to: r.attributes.id }) },
      attributeReferenceValues: { attribute: r.one.attributes({ from: r.attributeReferenceValues.attributeId, to: r.attributes.id }) },
      // Typed value tables carry an `attribute` back-relation so they're
      // first-class RQB/Pothos tables (needed for their GraphQL object types).
      attributeTextValues: { attribute: r.one.attributes({ from: r.attributeTextValues.attributeId, to: r.attributes.id }) },
      attributeNumericValues: { attribute: r.one.attributes({ from: r.attributeNumericValues.attributeId, to: r.attributes.id }) },
      attributeBooleanValues: { attribute: r.one.attributes({ from: r.attributeBooleanValues.attributeId, to: r.attributes.id }) },
      attributeDateValues: { attribute: r.one.attributes({ from: r.attributeDateValues.attributeId, to: r.attributes.id }) },
      attributeFileValues: { attribute: r.one.attributes({ from: r.attributeFileValues.attributeId, to: r.attributes.id }) },
    }),
  )
}

export type Relations = ReturnType<typeof attributeRelations>
