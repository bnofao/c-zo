import type { GraphQLSchema } from 'graphql'
import { trace } from '@opentelemetry/api'
import PothosSchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import ErrorsPlugin from '@pothos/plugin-errors'
import RelayPlugin from '@pothos/plugin-relay'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import ValidationPlugin from '@pothos/plugin-zod'
import { ValidationError } from './errors'
import { registerErrorTypes } from './errors/builders'
import { DateTimeResolver, JSONObjectResolver } from './scalars'

export interface SchemaBuilderOptions<DB, Relations> {
  db: DB
  relations: Relations
  extraPlugins?: string[]
  extraPluginOptions?: Record<string, any>
}

// Re-export Pothos's SchemaBuilder type under the same name as the value import.
// The `<DB, Relations, Ctx>` phantom parameters are preserved for forward-compatibility —
// they're not yet threaded into Pothos's SchemaTypes (cascading constraint issues), but
// the signatures remain stable for when consumers provide concrete types in follow-up PRs.
export type SchemaBuilder<_DB = any, _Relations = any, _Ctx = any> = PothosSchemaTypes.SchemaBuilder<any>

// Module-level state — single contribution registry.
const contributions: Array<(builder: SchemaBuilder<any, any, any>) => void> = []
let built = false

export function initBuilder<DB, Relations, Ctx = object>(
  opts: SchemaBuilderOptions<DB, Relations>,
): SchemaBuilder<DB, Relations, Ctx> {
  const builder: SchemaBuilder<DB, Relations, Ctx> = new (PothosSchemaBuilder as any)({
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
    zod: {
      validationError: (error: any) => ValidationError.fromZod(error),
    },
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
            finally {
              span.end()
            }
          },
        )
      },
    },
    ...(opts.extraPluginOptions ?? {}),
  })

  // Scalars
  builder.addScalarType('DateTime', DateTimeResolver, {})
  builder.addScalarType('JSONObject', JSONObjectResolver, {})

  // Root types
  builder.queryType({})
  builder.mutationType({})

  // Shared error types
  registerErrorTypes(builder)

  return builder
}

export function registerSchema<DB = any, Relations = any, Ctx = any>(
  contribute: (builder: SchemaBuilder<DB, Relations, Ctx>) => void,
): void {
  contributions.push(contribute as (b: SchemaBuilder<any, any, any>) => void)
}

export function buildSchema(builder: SchemaBuilder<any, any, any>): GraphQLSchema {
  if (built)
    throw new Error('Schema already built — buildSchema() called twice')
  for (const contribute of contributions) contribute(builder)
  built = true
  return builder.toSchema()
}

// For testing only — resets module state so tests can build multiple times.
export function _resetBuilderState(): void {
  contributions.length = 0
  built = false
}
