import type { Database, RelationsEntry } from '@czo/kit/db'
import type { GraphQLSchema } from 'graphql'
import type { GraphQLContextMap } from './context'
import { trace } from '@opentelemetry/api'
import PothosSchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import ErrorsPlugin from '@pothos/plugin-errors'
import RelayPlugin from '@pothos/plugin-relay'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing'
import ValidationPlugin from '@pothos/plugin-validation'
import { getTableConfig } from 'drizzle-orm/pg-core'
import z from 'zod'
import { ValidationError } from './errors'
import { registerErrorTypes } from './errors/builders'
import { DateTimeResolver, JSONObjectResolver } from './scalars'

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
export type SchemaBuilder<Relations extends RelationsEntry = RelationsEntry> = ReturnType<typeof initBuilder<Relations>>

// Module-level state — single contribution registry.
const authScopeContributions: Array<(builder: any) => Record<string, any>> = []
const contributions: Array<(builder: any) => void> = []
let built = false

export function initBuilder<Relations extends RelationsEntry>(
  opts: SchemaBuilderOptions<Relations>,
) {
  const builder = new PothosSchemaBuilder<BuilderSchemaTypes<Relations>>({
    plugins: [
      DrizzlePlugin,
      RelayPlugin,
      ErrorsPlugin,
      ScopeAuthPlugin,
      ValidationPlugin,
      TracingPlugin,
      // ...(opts.extraPlugins ?? []),
    ],
    drizzle: { client: opts.db as any, getTableConfig: getTableConfig as any },
    relay: { clientMutationId: 'omit', cursorType: 'String' },
    errors: { 
      unsafelyHandleInputErrors: true,
      defaultResultOptions: {
        name: ({ parentTypeName, fieldName }) => `${fieldName[0]?.toUpperCase() + fieldName.slice(1)}Success`,
      },
      defaultUnionOptions: {
        name: ({ parentTypeName, fieldName }) => `${fieldName[0]?.toUpperCase() + fieldName.slice(1)}Result`,
      },
    },
    validation: {
      validationError: result => ValidationError.fromStandardSchema(result),
    },
    scopeAuth: {
      authScopes: async (ctx: any) => ({
        permission: async ({ resource, actions }: { resource: string, actions: string[] }) =>
          ctx?.auth?.authService?.hasPermission?.(
            { userId: ctx?.auth?.user?.id, organizationId: ctx?.auth?.session?.activeOrganizationId },
            { [resource]: actions },
          ) ?? false,
        ...buildAuthScopes(ctx),
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
  builder.addScalarType('Date', DateTimeResolver)
  builder.addScalarType('Time', DateTimeResolver)
  // Root types
  builder.queryType({})
  builder.mutationType({})

  // Shared error types
  registerErrorTypes(builder)

  return builder
}

export function registerAuthScopes(
  scopes: (ctx: GraphQLContextMap) => Record<string, any>,
): void {
  authScopeContributions.push(scopes)
}

function buildAuthScopes(ctx: GraphQLContextMap) {
  const authScopes = authScopeContributions.map(contribute => contribute(ctx))
  return Object.assign({}, ...authScopes)
}

export function registerSchema<Relations extends RelationsEntry>(
  contribute: (builder: SchemaBuilder<Relations>) => void,
): void {
  contributions.push(contribute)
}

export function buildSchema(builder: any): GraphQLSchema {
  if (built)
    throw new Error('Schema already built — buildSchema() called twice')

  stringFilterInputRef(builder)
  booleanFilterInputRef(builder)
  dateTimeFilterInputRef(builder)
  dateFilterInputRef(builder)
  timeFilterInputRef(builder)
  intFilterInputRef(builder)
  floatFilterInputRef(builder)
  idFilterInputRef(builder)

  for (const contribute of contributions) contribute(builder)
  built = true
  return builder.toSchema()
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

// For testing only — resets module state so tests can build multiple times.
export function _resetBuilderState(): void {
  contributions.length = 0
  built = false
}

export const orderDirectionSchema = z.enum({
  ASC: 'asc',
  DESC: 'desc',
})

export interface OrderByInput<T> {
  field: T
  direction: z.infer<typeof orderDirectionSchema>
}
