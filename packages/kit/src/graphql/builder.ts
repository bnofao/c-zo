import type { GraphQLSchema } from 'graphql'
import { trace } from '@opentelemetry/api'
import SchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import ErrorsPlugin from '@pothos/plugin-errors'
import RelayPlugin from '@pothos/plugin-relay'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import ValidationPlugin from '@pothos/plugin-zod'
import { registerErrorTypes } from './errors/builders'
import { DateTimeResolver, JSONObjectResolver } from './scalars'

export interface CZOBuilderOptions<DB, Relations> {
  db: DB
  relations: Relations
  extraPlugins?: string[]

  extraPluginOptions?: Record<string, any>
}

export type CZOBuilder<_DB = any, _Relations = any, _Ctx = any> = PothosSchemaTypes.SchemaBuilder<any>

// Module-level state — single contribution registry

const contributions: Array<(builder: CZOBuilder<any, any, any>) => void> = []
let built = false

export function initBuilder<DB, Relations, Ctx extends object = object>(
  opts: CZOBuilderOptions<DB, Relations>,
): CZOBuilder<DB, Relations, Ctx> {
  const builder = new (SchemaBuilder as any)({
    plugins: [
      DrizzlePlugin,
      RelayPlugin,
      ErrorsPlugin,
      ScopeAuthPlugin,
      ValidationPlugin,
      TracingPlugin,
      ...(opts.extraPlugins ?? []),
    ],
    drizzle: { client: opts.db, relations: opts.relations },
    relay: { clientMutationId: 'omit', cursorType: 'String' },
    scopeAuth: {

      authScopes: async (ctx: any) => ({

        permission: async ({ resource, actions }: { resource: string, actions: string[] }) =>
          ctx?.auth?.authService?.hasPermission?.({
            ctx: { userId: ctx?.auth?.user?.id, organizationId: ctx?.auth?.session?.activeOrganizationId },
            permissions: { [resource]: actions },
          }) ?? false,
      }),
    },
    tracing: {

      default: (config: any) => isRootField(config),

      wrap: (resolver: any, _options: any, fieldConfig: any) => async (...args: any[]) => {
        const tracer = trace.getTracer('graphql')
        return tracer.startActiveSpan(
          `graphql.${fieldConfig.parentType}.${fieldConfig.name}`,
          async (span) => {
            try {
              return await resolver(...args)
            }
            catch (err) {
              span.recordException(err as Error)
              throw err
            }
            finally { span.end() }
          },
        )
      },
    },
    ...(opts.extraPluginOptions ?? {}),
  }) as unknown as CZOBuilder<DB, Relations, Ctx>

  // Scalars

  ;(builder as any).addScalarType('DateTime', DateTimeResolver)

  ;(builder as any).addScalarType('JSONObject', JSONObjectResolver)

  // Root types

  ;(builder as any).queryType({})

  ;(builder as any).mutationType({})

  // Shared error types
  registerErrorTypes(builder)

  return builder
}

export function registerSchema<DB, Relations, Ctx>(
  contribute: (builder: CZOBuilder<DB, Relations, Ctx>) => void,
): void {
  contributions.push(contribute as any)
}

export function buildSchema(builder: CZOBuilder<any, any, any>): GraphQLSchema {
  if (built)
    throw new Error('Schema already built — buildSchema() called twice')
  for (const contribute of contributions) contribute(builder)
  built = true

  return (builder as any).toSchema()
}

// For testing only — resets module state so tests can build multiple times.
export function _resetBuilderState(): void {
  contributions.length = 0
  built = false
}
