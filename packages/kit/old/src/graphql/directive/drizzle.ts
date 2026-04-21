import type { GraphQLInputObjectType } from 'graphql'
import type { DirectiveDefinition } from '.'
import { GraphQLNonNull } from 'graphql'
import { fromGlobalId } from '../relay/global-id'

/**
 * Apply @drizzle transformations to an input object's values.
 * Reads directive annotations directly from `field.astNode.directives`.
 *
 * - GlobalIDFilterInput fields: decodes `eq`/`in` global IDs to local IDs
 * - `column` arg: remaps the field key in the output object
 * - StringFilterInput and others: pass through as-is
 */
export function applyDrizzleDirectives(
  inputObj: Record<string, unknown> | undefined,
  inputType: GraphQLInputObjectType | undefined,
): Record<string, unknown> | undefined {
  if (!inputObj || !inputType)
    return inputObj

  const fields = inputType.getFields()
  const transformed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(inputObj)) {
    if (value == null)
      continue

    const field = fields[key]
    if (!field) {
      transformed[key] = value
      continue
    }

    const directive = field.astNode?.directives?.find(d => d.name.value === 'drizzle')
    if (!directive) {
      transformed[key] = value
      continue
    }

    // Read directive args
    const columnArg = directive.arguments?.find(a => a.name.value === 'column')
    const outputKey = (columnArg && 'value' in columnArg.value ? columnArg.value.value as string : null) ?? key

    // Resolve the underlying type name (unwrap NonNull)
    let fieldType = field.type
    if (fieldType instanceof GraphQLNonNull)
      fieldType = fieldType.ofType
    const typeName = 'name' in fieldType ? (fieldType as { name: string }).name : ''

    if (typeName === 'GlobalIDFilterInput') {
      const filter = value as { eq?: string, in?: string[] }
      const decoded: Record<string, unknown> = {}
      if (filter.eq != null)
        decoded.eq = fromGlobalId(filter.eq).id
      if (filter.in != null)
        decoded.in = filter.in.map(gid => fromGlobalId(gid).id)
      transformed[outputKey] = decoded
    }
    else {
      transformed[outputKey] = value
    }
  }

  return Object.keys(transformed).length > 0 ? transformed : undefined
}

// @drizzle is a pure annotation directive — no schema transformation needed.
// Resolvers call applyDrizzleDirectives() to transform input values.
export const drizzleDirective: DirectiveDefinition = {
  name: 'drizzle',
  typeDef: 'directive @drizzle(column: String) on INPUT_FIELD_DEFINITION',
  transformer: schema => schema,
}
