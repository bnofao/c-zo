import SchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import RelayPlugin from '@pothos/plugin-relay'
import ErrorsPlugin from '@pothos/plugin-errors'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import ValidationPlugin from '@pothos/plugin-zod'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import type { GraphQLSchema } from 'graphql'
import { trace } from '@opentelemetry/api'
import { DateTimeResolver, JSONObjectResolver } from './scalars'
import { registerErrorTypes } from './errors/builders'

export interface CZOBuilderOptions<DB, Relations> {
  db: DB
  relations: Relations
  extraPlugins?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraPluginOptions?: Record<string, any>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CZOBuilder<DB = any, Relations = any, Ctx = any> = PothosSchemaTypes.SchemaBuilder<any>

// Module-level state — single contribution registry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const contributions: Array<(builder: CZOBuilder<any, any, any>) => void> = []
let built = false

export function initBuilder<DB, Relations, Ctx extends object = object>(
  opts: CZOBuilderOptions<DB, Relations>,
): CZOBuilder<DB, Relations, Ctx> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authScopes: async (ctx: any) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permission: async ({ resource, actions }: { resource: string; actions: string[] }) =>
          ctx?.auth?.authService?.hasPermission?.({
            ctx: { userId: ctx?.auth?.user?.id, organizationId: ctx?.auth?.session?.activeOrganizationId },
            permissions: { [resource]: actions },
          }) ?? false,
      }),
    },
    tracing: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      default: (config: any) => isRootField(config),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wrap: (resolver: any, _options: any, fieldConfig: any) => async (...args: any[]) => {
        const tracer = trace.getTracer('graphql')
        return tracer.startActiveSpan(
          `graphql.${fieldConfig.parentType}.${fieldConfig.name}`,
          async (span) => {
            try { return await resolver(...args) }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(builder as any).addScalarType('DateTime', DateTimeResolver)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(builder as any).addScalarType('JSONObject', JSONObjectResolver)

  // Root types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(builder as any).queryType({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(builder as any).mutationType({})

  // Shared error types
  registerErrorTypes(builder)

  return builder
}

export function registerSchema<DB, Relations, Ctx>(
  contribute: (builder: CZOBuilder<DB, Relations, Ctx>) => void,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contributions.push(contribute as any)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSchema(builder: CZOBuilder<any, any, any>): GraphQLSchema {
  if (built) throw new Error('buildSchema() called twice — schema already assembled')
  for (const contribute of contributions) contribute(builder)
  built = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (builder as any).toSchema()
}

// For testing only — resets module state so tests can build multiple times.
export function _resetBuilderState(): void {
  contributions.length = 0
  built = false
}
