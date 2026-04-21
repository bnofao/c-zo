import type { GraphQLFieldConfig } from 'graphql'
import { registerDirective } from '@czo/kit/graphql'
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils'
import { GraphQLError } from 'graphql'

registerDirective({
  name: 'auth',
  typeDef: 'directive @auth on FIELD_DEFINITION',
  transformer: schema =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const directive = getDirective(schema, fieldConfig, 'auth')
        if (!directive?.length)
          return fieldConfig
        return wrapResolve(fieldConfig, (_args, ctx) => {
          if (!ctx.auth?.session) {
            throw new GraphQLError('UNAUTHENTICATED', { extensions: { code: 'UNAUTHENTICATED' } })
          }
        })
      },
    }),
})

registerDirective({
  name: 'admin',
  typeDef: 'directive @admin on FIELD_DEFINITION',
  transformer: schema =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const directive = getDirective(schema, fieldConfig, 'admin')
        if (!directive?.length)
          return fieldConfig
        return wrapResolve(fieldConfig, (_args, ctx) => {
          if (!ctx.auth?.session) {
            throw new GraphQLError('UNAUTHENTICATED', { extensions: { code: 'UNAUTHENTICATED' } })
          }
          const roles = ctx.auth.user?.role?.split(',') ?? []
          if (!roles.some((r: string) => r === 'admin' || r === 'superadmin')) {
            throw new GraphQLError('FORBIDDEN', { extensions: { code: 'FORBIDDEN' } })
          }
        })
      },
    }),
})

registerDirective({
  name: 'permission',
  typeDef: 'directive @permission(resource: String!, action: String!) on FIELD_DEFINITION',
  transformer: schema =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const directive = getDirective(schema, fieldConfig, 'permission')
        if (!directive?.length)
          return fieldConfig
        const { resource, action } = directive[0] as { resource: string, action: string }
        return wrapResolve(fieldConfig, async (_args, ctx) => {
          if (!ctx.auth?.session) {
            throw new GraphQLError('UNAUTHENTICATED', { extensions: { code: 'UNAUTHENTICATED' } })
          }
          const allowed = await ctx.auth.authService.hasPermission(
            { userId: ctx.auth.session.userId, organizationId: ctx.auth.session.organizationId ?? undefined },
            { [resource]: [action] },
            ctx.auth.user?.role ?? undefined,
          )
          if (!allowed) {
            throw new GraphQLError('FORBIDDEN', { extensions: { code: 'FORBIDDEN' } })
          }
        })
      },
    }),
})

function wrapResolve(
  fieldConfig: GraphQLFieldConfig<unknown, unknown>,
  guard: (args: Record<string, unknown>, ctx: Record<string, any>) => void | Promise<void>,
): GraphQLFieldConfig<unknown, unknown> {
  const originalResolve = fieldConfig.resolve
  return {
    ...fieldConfig,
    resolve: async (source, args, ctx, info) => {
      await guard(args, ctx as Record<string, any>)
      if (originalResolve) {
        return originalResolve(source, args, ctx, info)
      }
      return (source as Record<string, unknown>)?.[info.fieldName]
    },
  }
}
