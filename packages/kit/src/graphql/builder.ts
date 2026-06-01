import type { RelationsEntry } from '@czo/kit/db'
import type { GraphQLSchema } from 'graphql'
import type { Database } from '../db'
import { trace } from '@opentelemetry/api'
import PothosSchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import ErrorsPlugin from '@pothos/plugin-errors'
import RelayPlugin from '@pothos/plugin-relay'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import ValidationPlugin from '@pothos/plugin-validation'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { Context, Effect, Layer } from 'effect'
import { DateTimeResolver, JSONObjectResolver } from 'graphql-scalars'
import z from 'zod'
import { DrizzleDb } from '../db'
import { ValidationError } from './errors'
import { registerErrorTypes } from './errors/builders'

export interface SchemaBuilderOptions<Relations extends RelationsEntry> {
  db: Database
  relations: Relations
  extraPlugins?: string[]
  extraPluginOptions?: Record<string, any>
}

export interface BuilderSchemaTypes<Relations extends RelationsEntry> extends Partial<PothosSchemaTypes.UserSchemaTypes> {
  Context: GraphQLContextMap
  Scalars: {
    DateTime: { Input: Date | string, Output: Date }
    JSONObject: { Input: Record<string, any>, Output: Record<string, unknown> }
    Date: { Input: Date | string, Output: Date }
    Time: { Input: Date | string, Output: Date }
  }
  DrizzleRelations: Relations
  Inputs: BuilderSchemaInputs
  Objects: BuilderSchemaObjects
  AuthScopes: BuilderAuthScopes
  DefaultFieldNullability: false
  DefaultInputFieldRequiredness: false
}

export interface GraphQLContextMap {
  request: Request
  runEffect: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A>
  /**
   * Queue an already-serialized `Set-Cookie` header value to flush onto the
   * HTTP response Yoga sends. Cookies cannot be set via the h3 event: Yoga owns
   * the Node response and never flushes `event.res`. A kit `onResponse` plugin
   * appends every queued value to the outgoing response headers.
   */
  setCookie: (serialized: string) => void
}

export interface BuilderSchemaObjects {
}

export interface BuilderAuthScopes {
}

export interface BuilderSchemaInputs {
  StringFilterInput: StringFilter
  BooleanFilterInput: BooleanFilter
  DateTimeFilterInput: DateTimeFilter
  DateFilterInput: DateFilter
  TimeFilterInput: TimeFilter
  IntFilterInput: IntFilter
  FloatFilterInput: FloatFilter
  IDFilterInput: IDFilter
}

// Re-export Pothos's SchemaBuilder type under the same name as the value import.
// The `<DB, Relations, Ctx>` phantom parameters are preserved for forward-compatibility —
// they're not yet threaded into Pothos's SchemaTypes (cascading constraint issues), but
// the signatures remain stable for when consumers provide concrete types in follow-up PRs.
export type SchemaBuilder<Relations extends RelationsEntry = RelationsEntry> = ReturnType<typeof setupBuilder<Relations>>

export class GraphQLBuilder extends Context.Service<GraphQLBuilder, {
  // readonly contributions: Effect.Effect<ReadonlyArray<(builder: SchemaBuilder) => void>>
  // readonly authScope: Effect.Effect<ReadonlyArray<(ctx: GraphQLContextMap) => Record<string, unknown>>>
  readonly buildContext: (systemContext: unknown) => Effect.Effect<GraphQLContextMap, unknown, any>
  readonly buildSchema: () => Effect.Effect<GraphQLSchema, never, DrizzleDb>
}>()('@czo/kit/GraphQLBuilder') {}

export function makeGraphQLBuilder(
  contributions: ReadonlyArray<(builder: SchemaBuilder) => void>,
  contexts: ReadonlyArray<(systemContext: unknown) => Effect.Effect<Partial<GraphQLContextMap>, unknown, any>>,
  authScope: ReadonlyArray<(ctx: GraphQLContextMap) => Record<string, unknown>>,
  relations: RelationsEntry,
) {
  return Layer.effect(
    GraphQLBuilder,
    Effect.gen(function* () {
      return GraphQLBuilder.of({
        // contributions: Effect.succeed(contributions ?? []),
        // authScope: Effect.succeed(authScope ?? []),
        buildContext: (systemContext: unknown) => Effect.gen(function* () {
          const parts = yield* Effect.all(contexts.map(ctx => ctx(systemContext)), { concurrency: 'unbounded' })
          return Object.assign({}, ...parts)
        }),
        buildSchema: () =>
          Effect.gen(function* () {
            const db = yield* DrizzleDb
            const builder = setupBuilder(db, relations, authScope)

            stringFilterInputRef(builder)
            booleanFilterInputRef(builder)
            dateTimeFilterInputRef(builder)
            dateFilterInputRef(builder)
            timeFilterInputRef(builder)
            intFilterInputRef(builder)
            floatFilterInputRef(builder)
            idFilterInputRef(builder)

            for (const contribute of contributions) contribute(builder)

            return builder.toSchema()
          }),
      })
    }),
  )
}

function setupBuilder<Relations extends RelationsEntry>(
  db: Database,
  relations: Relations,
  authScope: ReadonlyArray<(ctx: GraphQLContextMap) => Record<string, unknown>>,
) {
  const builder = new PothosSchemaBuilder<BuilderSchemaTypes<Relations>>({
    defaultFieldNullability: false,
    plugins: [
      DrizzlePlugin,
      RelayPlugin,
      ErrorsPlugin,
      ScopeAuthPlugin,
      ValidationPlugin,
      TracingPlugin,
      // ...(opts.extraPlugins ?? []),
    ],
    // The drizzle plugin's model-loader is promise-based (`query.then(...)`), so
    // it gets the node-postgres `$promise` view (same pool); the effect-postgres
    // `db` stays the resolvers' client via `ctx.runEffect`. Falls back to `db`
    // for lightweight test layers that don't build a `$promise` view.
    drizzle: { client: (db.$promise ?? db) as any, getTableConfig: getTableConfig as any, relations },
    relay: { clientMutationId: 'omit', cursorType: 'String' },
    errors: {
      unsafelyHandleInputErrors: true,
      defaultResultOptions: {
        name: ({ fieldName }) => `${fieldName[0]?.toUpperCase() + fieldName.slice(1)}Success`,
      },
      defaultUnionOptions: {
        name: ({ fieldName }) => `${fieldName[0]?.toUpperCase() + fieldName.slice(1)}Result`,
      },
    },
    validation: {
      validationError: result => ValidationError.fromStandardSchema(result),
    },
    scopeAuth: {
      authScopes: async ctx => Object.assign({}, ...authScope.map(scope => scope(ctx))),
    },
    tracing: {
      default: config => isRootField(config),
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
    // ...(opts.extraPluginOptions ?? {}),
  })

  // Scalars
  builder.addScalarType('DateTime', DateTimeResolver, {})
  builder.addScalarType('JSONObject', JSONObjectResolver, {})
  builder.addScalarType('Date', DateTimeResolver)
  builder.addScalarType('Time', DateTimeResolver)
  // Root types
  builder.queryType({})
  builder.mutationType({})

  // Shared error types
  registerErrorTypes(builder)

  return builder
}

// export function registerSchemaBuilderRefs<Relations extends RelationsEntry>(
//   refs: (builder: SchemaBuilder<Relations>, refs: SchemaBuilderRefs<Relations>) => Record<string, unknown>,
// ): void {
//   schemaRefs.push(refs)
// }

// export interface SchemaBuilderRefs<Relations extends RelationsEntry = RelationsEntry> {
//   StringFilterInput: ReturnType<typeof stringFilterInputRef<Relations>>
//   BooleanFilterInput: ReturnType<typeof booleanFilterInputRef<Relations>>
//   DateTimeFilterInput: ReturnType<typeof dateTimeFilterInputRef<Relations>>
//   DateFilterInput: ReturnType<typeof dateFilterInputRef<Relations>>
//   TimeFilterInput: ReturnType<typeof timeFilterInputRef<Relations>>
//   IntFilterInput: ReturnType<typeof intFilterInputRef<Relations>>
//   FloatFilterInput: ReturnType<typeof floatFilterInputRef<Relations>>
//   IDFilterInput: ReturnType<typeof idFilterInputRef<Relations>>
// }

function _logicalFilterSchema<T extends z.ZodObject>(schema: T) {
  return {
    get OR() { return z.array(schema).optional().nullable() },
    get AND() { return z.array(schema).optional().nullable() },
    get NOT() { return schema.optional().nullable() },
  }
}

// function stringFilterSchema() {
//   return z.object({
//     eq: z.string().optional().nullable(),
//     ne: z.string().optional().nullable(),
//     like: z.string().optional().nullable(),
//     ilike: z.string().optional().nullable(),
//     notLike: z.string().optional().nullable(),
//     notIlike: z.string().optional().nullable(),
//     in: z.array(z.string()).optional().nullable(),
//     notIn: z.array(z.string()).optional().nullable(),
//   })
// }

const stringFilterSchema = z.object({
  eq: z.string().optional(),
  ne: z.string().optional(),
  like: z.string().optional(),
  ilike: z.string().optional(),
  notLike: z.string().optional(),
  notIlike: z.string().optional(),
  in: z.array(z.string()).optional(),
  notIn: z.array(z.string()).optional(),
  get OR() { return z.array(stringFilterSchema).optional() },
  get AND() { return z.array(stringFilterSchema).optional() },
  get NOT() { return stringFilterSchema.optional() },
})

// const cool = stringFilterSchema(true)
// const coool = cool.extend(logicalFilterSchema(cool))

type _ok = z.infer<typeof stringFilterSchema>

interface LogicalFilter<T> {
  OR?: T[] | null
  AND?: T[] | null
  NOT?: T | null
}

export interface StringFilter extends LogicalFilter<StringFilter> {
  eq?: string | null
  ne?: string | null
  like?: string | null
  ilike?: string | null
  notLike?: string | null
  notIlike?: string | null
  in?: string[] | null
  notIn?: string[] | null
}

function stringFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<StringFilter>('StringFilterInput').implement({
    fields: t => ({
      eq: t.string(),
      ne: t.string(),
      like: t.string(),
      ilike: t.string(),
      notLike: t.string(),
      notIlike: t.string(),
      in: t.stringList(),
      notIn: t.stringList(),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface BooleanFilter extends LogicalFilter<BooleanFilter> {
  eq?: boolean | null
}

function booleanFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<BooleanFilter>('BooleanFilterInput').implement({
    fields: t => ({
      eq: t.boolean(),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface DateTimeFilter extends LogicalFilter<DateTimeFilter> {
  eq?: Date | string | null
  ne?: Date | string | null
  gt?: Date | string | null
  gte?: Date | string | null
  lt?: Date | string | null
  lte?: Date | string | null
  in?: (Date | string)[] | null
  notIn?: (Date | string)[] | null
}

function dateTimeFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<DateTimeFilter>('DateTimeFilterInput').implement({
    fields: t => ({
      eq: t.field({ type: 'DateTime' }),
      ne: t.field({ type: 'DateTime' }),
      gt: t.field({ type: 'DateTime' }),
      gte: t.field({ type: 'DateTime' }),
      lt: t.field({ type: 'DateTime' }),
      lte: t.field({ type: 'DateTime' }),
      in: t.field({ type: ['DateTime'] }),
      notIn: t.field({ type: ['DateTime'] }),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface DateFilter extends LogicalFilter<DateFilter> {
  eq?: Date | string | null
  ne?: Date | string | null
  gt?: Date | string | null
  gte?: Date | string | null
  lt?: Date | string | null
  lte?: Date | string | null
  in?: (Date | string)[] | null
  notIn?: (Date | string)[] | null
}

function dateFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<DateFilter>('DateFilterInput').implement({
    fields: t => ({
      eq: t.field({ type: 'Date' }),
      ne: t.field({ type: 'Date' }),
      gt: t.field({ type: 'Date' }),
      gte: t.field({ type: 'Date' }),
      lt: t.field({ type: 'Date' }),
      lte: t.field({ type: 'Date' }),
      in: t.field({ type: ['Date'] }),
      notIn: t.field({ type: ['Date'] }),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface TimeFilter extends LogicalFilter<TimeFilter> {
  eq?: Date | string | null
  ne?: Date | string | null
  gt?: Date | string | null
  gte?: Date | string | null
  lt?: Date | string | null
  lte?: Date | string | null
  in?: (Date | string)[] | null
  notIn?: (Date | string)[] | null
}

function timeFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<TimeFilter>('TimeFilterInput').implement({
    fields: t => ({
      eq: t.field({ type: 'Time' }),
      ne: t.field({ type: 'Time' }),
      gt: t.field({ type: 'Time' }),
      gte: t.field({ type: 'Time' }),
      lt: t.field({ type: 'Time' }),
      lte: t.field({ type: 'Time' }),
      in: t.field({ type: ['Time'] }),
      notIn: t.field({ type: ['Time'] }),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface IntFilter extends LogicalFilter<IntFilter> {
  eq?: number | null
  ne?: number | null
  gt?: number | null
  gte?: number | null
  lt?: number | null
  lte?: number | null
  in?: number[] | null
  notIn?: number[] | null
}

function intFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<IntFilter>('IntFilterInput').implement({
    fields: t => ({
      eq: t.int(),
      ne: t.int(),
      gt: t.int(),
      gte: t.int(),
      lt: t.int(),
      lte: t.int(),
      in: t.intList(),
      notIn: t.intList(),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface FloatFilter extends LogicalFilter<FloatFilter> {
  eq?: number | null
  ne?: number | null
  gt?: number | null
  gte?: number | null
  lt?: number | null
  lte?: number | null
  in?: number[] | null
  notIn?: number[] | null
}

function floatFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<FloatFilter>('FloatFilterInput').implement({
    fields: t => ({
      eq: t.float(),
      ne: t.float(),
      gt: t.float(),
      gte: t.float(),
      lt: t.float(),
      lte: t.float(),
      in: t.floatList(),
      notIn: t.floatList(),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export interface IDFilter extends LogicalFilter<IDFilter> {
  eq?: string | null
  in?: string[] | null
  notIn?: string[] | null
}

function idFilterInputRef<Relations extends RelationsEntry>(builder: SchemaBuilder<Relations>) {
  const ref = builder.inputRef<IDFilter>('IDFilterInput').implement({
    fields: t => ({
      eq: t.id(),
      in: t.idList(),
      notIn: t.idList(),
      OR: t.field({ type: [ref] }),
      AND: t.field({ type: [ref] }),
      NOT: t.field({ type: ref }),
    }),
  })
  return ref
}

export const orderDirectionSchema = z.enum({
  ASC: 'asc',
  DESC: 'desc',
})

export interface OrderByInput<T> {
  field: T
  direction: z.infer<typeof orderDirectionSchema>
}
