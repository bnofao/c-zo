import type { GraphQLSchema } from 'graphql'
import type { DirectiveDefinition } from '..'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { toGlobalId } from '../../relay/global-id'

export const globalIdDirective: DirectiveDefinition = {
  name: 'globalId',
  typeDef: 'directive @globalId(type: String!) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'globalId')
        if (!directive?.length)
          return fieldConfig

        const { type } = directive[0] as { type: string }
        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            const result = originalResolve
              ? await originalResolve(source, args, ctx, info)
              : (source as Record<string, unknown>)?.[info.fieldName]

            if (result == null)
              return result
            return toGlobalId(type, String(result))
          },
        }
      },
    }),
}
