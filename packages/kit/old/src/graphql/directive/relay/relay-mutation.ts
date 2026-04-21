import type { GraphQLSchema } from 'graphql'
import type { DirectiveDefinition } from '..'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { toUserErrors } from '../../relay/errors'

export const relayMutationDirective: DirectiveDefinition = {
  name: 'relayMutation',
  typeDef: 'directive @relayMutation(payloadField: String!) on FIELD_DEFINITION',
  transformer: (schema: GraphQLSchema) =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, _typeName, schema) => {
        const directive = getDirective(schema, fieldConfig, 'relayMutation')
        if (!directive?.length)
          return fieldConfig

        const { payloadField } = directive[0] as { payloadField: string }
        const originalResolve = fieldConfig.resolve

        return {
          ...fieldConfig,
          resolve: async (source, args, ctx, info) => {
            try {
              const result = originalResolve
                ? await originalResolve(source, args, ctx, info)
                : (source as Record<string, unknown>)?.[info.fieldName]

              return {
                [payloadField]: result,
                userErrors: [],
              }
            }
            catch (error) {
              return {
                [payloadField]: null,
                userErrors: toUserErrors(error),
              }
            }
          },
        }
      },
    }),
}
