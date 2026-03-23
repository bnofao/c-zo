// packages/kit/src/graphql/relay/directives/connection.ts
import type { GraphQLSchema } from 'graphql'
import { GraphQLError } from 'graphql'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import type { DirectiveDefinition } from '../../directives'
import { buildConnection } from '../connection'
import { encodeCursor } from '../cursor'

const DEFAULT_MAX_PAGE_SIZE = 100

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

            if (first != null && first > maxPageSize) {
              throw new GraphQLError(`"first" must not exceed ${maxPageSize}`)
            }

            if (last != null && last > maxPageSize) {
              throw new GraphQLError(`"last" must not exceed ${maxPageSize}`)
            }

            const result = originalResolve
              ? await originalResolve(source, args, ctx, info)
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
              args: args as { first?: number, after?: string, last?: number, before?: string },
              totalCount,
              getCursor,
            })
          },
        }
      },
    }),
}
