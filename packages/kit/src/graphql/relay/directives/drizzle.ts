import type { GraphQLFieldConfig, GraphQLSchema } from 'graphql'
import type { DirectiveDefinition } from '../../directives'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { GraphQLInputObjectType, GraphQLNonNull, isInputObjectType } from 'graphql'
import { fromGlobalId } from '../global-id'

/**
 * Transform a where argument's values based on @drizzle annotations on the input type fields.
 * - GlobalIDFilterInput: decode global IDs (eq, in) to local IDs
 * - column arg: remap the field key
 * - StringFilterInput and others: pass through as-is
 */
function transformInputValues(
  values: Record<string, unknown>,
  inputType: GraphQLInputObjectType,
  schema: GraphQLSchema,
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {}
  const fields = inputType.getFields()

  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue

    const field = fields[key]
    if (!field) {
      transformed[key] = value
      continue
    }

    const drizzleArgs = getDirective(schema, field, 'drizzle')
    if (!drizzleArgs?.length) {
      transformed[key] = value
      continue
    }

    const { column } = drizzleArgs[0] as { column?: string }
    const outputKey = column ?? key

    // Resolve the underlying type name (unwrap NonNull)
    let fieldType = field.type
    if (fieldType instanceof GraphQLNonNull) fieldType = fieldType.ofType
    const typeName = 'name' in fieldType ? (fieldType as { name: string }).name : ''

    if (typeName === 'GlobalIDFilterInput') {
      const filter = value as { eq?: string, in?: string[] }
      const decoded: Record<string, unknown> = {}
      if (filter.eq != null) decoded.eq = fromGlobalId(filter.eq).id
      if (filter.in != null) decoded.in = filter.in.map(gid => fromGlobalId(gid).id)
      transformed[outputKey] = decoded
    }
    else {
      transformed[outputKey] = value
    }
  }

  return transformed
}

/**
 * Check if an input type has any fields annotated with @drizzle.
 */
function hasDrizzleFields(inputType: GraphQLInputObjectType, schema: GraphQLSchema): boolean {
  for (const field of Object.values(inputType.getFields())) {
    if (getDirective(schema, field, 'drizzle')?.length) return true
  }
  return false
}

/**
 * Find all arguments on a field config whose input type contains @drizzle annotations.
 * Returns a list of arg names that need transformation.
 */
function findDrizzleArgs(
  fieldConfig: GraphQLFieldConfig<unknown, unknown>,
  schema: GraphQLSchema,
): Array<{ argName: string, inputType: GraphQLInputObjectType }> {
  const result: Array<{ argName: string, inputType: GraphQLInputObjectType }> = []
  if (!fieldConfig.args) return result

  for (const [argName, argConfig] of Object.entries(fieldConfig.args)) {
    let argType = argConfig.type
    if (argType instanceof GraphQLNonNull) argType = argType.ofType
    if (isInputObjectType(argType) && hasDrizzleFields(argType, schema)) {
      result.push({ argName, inputType: argType })
    }
  }

  return result
}

// @drizzle is an annotation directive on INPUT_FIELD_DEFINITION.
// At schema build time, the transformer scans all OBJECT_FIELDs for arguments
// whose input types contain @drizzle-annotated fields, and wraps their resolvers
// to auto-transform argument values before the original resolver is called.
export const drizzleDirective: DirectiveDefinition = {
  name: 'drizzle',
  typeDef: 'directive @drizzle(column: String) on INPUT_FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const drizzleArgs = findDrizzleArgs(fieldConfig, schema)
        if (drizzleArgs.length === 0) return fieldConfig

        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            const transformedArgs = { ...args }

            for (const { argName, inputType } of drizzleArgs) {
              if (transformedArgs[argName] && typeof transformedArgs[argName] === 'object') {
                transformedArgs[argName] = transformInputValues(
                  transformedArgs[argName] as Record<string, unknown>,
                  inputType,
                  info.schema,
                )
              }
            }

            return originalResolve
              ? originalResolve(source, transformedArgs, ctx, info)
              : (source as Record<string, unknown>)?.[info.fieldName]
          },
        }
      },
    }),
}
