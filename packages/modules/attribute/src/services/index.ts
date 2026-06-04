import { Layer } from 'effect'
import * as Attribute from './attribute'
import * as AttributeValue from './attribute-value'
import * as TypedValue from './typed-value'

export { Attribute, AttributeValue, TypedValue }

/** All attribute-module services, composed into one layer. */
export const AttributeModuleLive = Layer.mergeAll(
  Attribute.layer,
  AttributeValue.layer,
  TypedValue.layer,
)
