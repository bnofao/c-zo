import type { GraphQLSchema } from 'graphql'
import type { DirectiveDefinition } from '../../directives'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { GraphQLError, GraphQLInputObjectType, GraphQLNonNull, isInputObjectType, isNonNullType } from 'graphql'
import { fromGlobalId } from '../global-id'
import { buildConnection } from '../connection'
import { encodeCursor } from '../cursor'

const DEFAULT_MAX_PAGE_SIZE = 100

/**
 * Transform a `where` argument by reading @drizzle annotations on the input type fields.
 * - GlobalIDFilterInput fields: decode global IDs to local IDs
 * - column arg: remap the field key in the where object
 * - StringFilterInput fields: no-op (already RQBv2-compatible)
 */
function transformWhereArg(
  whereValue: Record<string, unknown> | undefined,
  whereInputType: GraphQLInputObjectType,
  schema: GraphQLSchema,
): Record<string, unknown> | undefined {
  if (!whereValue) return undefined

  const transformed: Record<string, unknown> = {}
  const fields = whereInputType.getFields()

  for (const [key, value] of Object.entries(whereValue)) {
    if (value == null) continue

    const field = fields[key]
    if (!field) {
      transformed[key] = value
      continue
    }

    const drizzleDirectives = getDirective(schema, field, 'drizzle')
    if (!drizzleDirectives?.length) {
      transformed[key] = value
      continue
    }

    const drizzleArgs = drizzleDirectives[0] as { column?: string }
    const outputKey = drizzleArgs.column ?? key

    // Determine the underlying type name (unwrap NonNull)
    let fieldType = field.type
    if (isNonNullType(fieldType)) fieldType = fieldType.ofType
    const typeName = 'name' in fieldType ? (fieldType as { name: string }).name : ''

    if (typeName === 'GlobalIDFilterInput') {
      // Decode global IDs to local IDs
      const filter = value as { eq?: string, in?: string[] }
      const decoded: Record<string, unknown> = {}
      if (filter.eq != null) decoded.eq = fromGlobalId(filter.eq).id
      if (filter.in != null) decoded.in = filter.in.map(gid => fromGlobalId(gid).id)
      transformed[outputKey] = decoded
    }
    else {
      // StringFilterInput and others: pass through as-is (already RQBv2-compatible)
      if (outputKey !== key) {
        transformed[outputKey] = value
      }
      else {
        transformed[key] = value
      }
    }
  }

  return Object.keys(transformed).length > 0 ? transformed : undefined
}

export const connectionDirective: DirectiveDefinition = {
  name: 'connection',
  typeDef: 'directive @connection(maxPageSize: Int = 100) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'connection')
        if (!directive?.length)
          return fieldConfig

        const maxPageSize = (directive[0] as { maxPageSize?: number }).maxPageSize ?? DEFAULT_MAX_PAGE_SIZE
        const originalResolve = fieldConfig.resolve

        // Find the `where` argument's input type for @drizzle transformation
        const whereArg = fieldConfig.args?.where
        let whereInputType: GraphQLInputObjectType | null = null
        if (whereArg) {
          let argType = whereArg.type
          if (argType instanceof GraphQLNonNull) argType = argType.ofType
          if (isInputObjectType(argType)) whereInputType = argType
        }

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            const { first, last } = args as { first?: number, last?: number }

            if (first == null && last == null) {
              throw new GraphQLError('You must provide either "first" or "last" argument')
            }

            if (first != null && last != null) {
              throw new GraphQLError('Cannot use both "first" and "last" simultaneously')
            }

            if (first != null && first < 0) {
              throw new GraphQLError('"first" must be a non-negative integer')
            }

            if (last != null && last < 0) {
              throw new GraphQLError('"last" must be a non-negative integer')
            }

            if (first != null && first > maxPageSize) {
              throw new GraphQLError(`"first" must not exceed ${maxPageSize}`)
            }

            if (last != null && last > maxPageSize) {
              throw new GraphQLError(`"last" must not exceed ${maxPageSize}`)
            }

            // Transform `where` arg using @drizzle annotations
            const transformedArgs = { ...args }
            if (whereInputType && args.where) {
              transformedArgs.where = transformWhereArg(
                args.where as Record<string, unknown>,
                whereInputType,
                info.schema,
              )
            }

            const result = originalResolve
              ? await originalResolve(source, transformedArgs, ctx, info)
              : (source as Record<string, unknown>)?.[info.fieldName]

            const { nodes, totalCount, getCursor: customGetCursor } = result as {
              nodes: Record<string, unknown>[]
              totalCount: number
              getCursor?: (node: Record<string, unknown>) => string
            }

            const getCursor = customGetCursor
              ?? ((node: Record<string, unknown>) => encodeCursor({ id: node.id }))

            return buildConnection({
              nodes,
              args: transformedArgs as { first?: number, after?: string, last?: number, before?: string },
              totalCount,
              getCursor,
            })
          },
        }
      },
    }),
}
