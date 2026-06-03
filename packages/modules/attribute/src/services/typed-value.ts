import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import {
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributeTextValues,
} from '../database/schema'
import { AttributeDbFailed } from './attribute'
import { AttributeParentNotOwned } from './attribute-value'

// One DB-failure definition for the whole module — re-exported from the
// attribute service rather than redefined.
export { AttributeDbFailed } from './attribute'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class TypedValueNotFound extends Data.TaggedError('TypedValueNotFound') {
  readonly code = 'TYPED_VALUE_NOT_FOUND'
  get message() { return 'Typed value not found' }
}

// ─── Domain models ────────────────────────────────────────────────────────────

export type AttributeTextValue = InferSelectModel<typeof attributeTextValues>
export type AttributeNumericValue = InferSelectModel<typeof attributeNumericValues>
export type AttributeBooleanValue = InferSelectModel<typeof attributeBooleanValues>
export type AttributeDateValue = InferSelectModel<typeof attributeDateValues>
export type AttributeFileValue = InferSelectModel<typeof attributeFileValues>

// ─── Input types ──────────────────────────────────────────────────────────────

interface CreateBase {
  attributeId: number
  organizationId: number | null
  externalSource?: string | null
  externalId?: string | null
}

export interface CreateTextInput extends CreateBase {
  plain: string
  rich?: unknown | null
}
export type UpdateTextInput = Partial<{ plain: string, rich: unknown | null }>

export interface CreateNumericInput extends CreateBase {
  value: number
}
export type UpdateNumericInput = Partial<{ value: number }>

export interface CreateBooleanInput extends CreateBase {
  value: boolean
}
export type UpdateBooleanInput = Partial<{ value: boolean }>

export interface CreateDateInput extends CreateBase {
  value: Date
}
export type UpdateDateInput = Partial<{ value: Date }>

export interface CreateFileInput extends CreateBase {
  fileUrl: string
  mimetype: string
}
export type UpdateFileInput = Partial<{ fileUrl: string, mimetype: string }>

// ─── Service contract ─────────────────────────────────────────────────────────

type Fail<A> = Effect.Effect<A, TypedValueNotFound | AttributeDbFailed>
/** Create failures also carry the parent-ownership integrity error (spec §2). */
type CreateFail<A> = Effect.Effect<A, AttributeParentNotOwned | AttributeDbFailed>

export class TypedValueService extends Context.Service<
  TypedValueService,
  {
    readonly createText: (input: CreateTextInput) => CreateFail<AttributeTextValue>
    readonly updateText: (id: number, input: UpdateTextInput) => Fail<AttributeTextValue>
    readonly deleteText: (id: number) => Fail<AttributeTextValue>

    readonly createNumeric: (input: CreateNumericInput) => CreateFail<AttributeNumericValue>
    readonly updateNumeric: (id: number, input: UpdateNumericInput) => Fail<AttributeNumericValue>
    readonly deleteNumeric: (id: number) => Fail<AttributeNumericValue>

    readonly createBoolean: (input: CreateBooleanInput) => CreateFail<AttributeBooleanValue>
    readonly updateBoolean: (id: number, input: UpdateBooleanInput) => Fail<AttributeBooleanValue>
    readonly deleteBoolean: (id: number) => Fail<AttributeBooleanValue>

    readonly createDate: (input: CreateDateInput) => CreateFail<AttributeDateValue>
    readonly updateDate: (id: number, input: UpdateDateInput) => Fail<AttributeDateValue>
    readonly deleteDate: (id: number) => Fail<AttributeDateValue>

    readonly createFile: (input: CreateFileInput) => CreateFail<AttributeFileValue>
    readonly updateFile: (id: number, input: UpdateFileInput) => Fail<AttributeFileValue>
    readonly deleteFile: (id: number) => Fail<AttributeFileValue>
  }
>()('@czo/attribute/TypedValueService') {}

// ─── Layer ────────────────────────────────────────────────────────────────────

type TypedValueServiceImpl = Context.Service.Shape<typeof TypedValueService>

type TypedTable
  = typeof attributeTextValues
    | typeof attributeNumericValues
    | typeof attributeBooleanValues
    | typeof attributeDateValues
    | typeof attributeFileValues

const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to AttributeDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new AttributeDbFailed({ cause })))

  /** Existence check by id; fail with TypedValueNotFound when absent. */
  const ensureExists = (table: TypedTable, id: number) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1))
      if (!row)
        return yield* Effect.fail(new TypedValueNotFound())
    })

  /**
   * Integrity guard (spec §2): a value may be grafted ONLY onto a platform
   * attribute (parent org null) or onto an attribute owned by the SAME org as
   * the value. A missing parent fails (the FK would reject anyway).
   */
  const ensureParentOwned = (attributeId: number, valueOrg: number | null) =>
    Effect.gen(function* () {
      const parent = yield* dbErr(db.query.attributes.findFirst({
        columns: { organizationId: true },
        where: { id: attributeId },
      }))
      if (parent == null)
        return yield* Effect.fail(new AttributeParentNotOwned())
      if (parent.organizationId !== null && parent.organizationId !== valueOrg)
        return yield* Effect.fail(new AttributeParentNotOwned())
    })

  return TypedValueService.of({
    // ── text ──
    createText: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const [row] = yield* dbErr(db.insert(attributeTextValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          plain: input.plain,
          rich: input.rich ?? null,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
        }).returning())
        return row!
      }),

    updateText: (id, input) =>
      Effect.gen(function* () {
        yield* ensureExists(attributeTextValues, id)
        const [row] = yield* dbErr(db.update(attributeTextValues).set({
          ...(input.plain != null && { plain: input.plain }),
          ...('rich' in input && { rich: input.rich ?? null }),
        }).where(eq(attributeTextValues.id, id)).returning())
        return row!
      }),

    deleteText: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeTextValues, id)
        const [row] = yield* dbErr(db.delete(attributeTextValues).where(eq(attributeTextValues.id, id)).returning())
        return row!
      }),

    // ── numeric ──
    createNumeric: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const [row] = yield* dbErr(db.insert(attributeNumericValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          value: input.value,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
        }).returning())
        return row!
      }),

    updateNumeric: (id, input) =>
      Effect.gen(function* () {
        yield* ensureExists(attributeNumericValues, id)
        const [row] = yield* dbErr(db.update(attributeNumericValues).set({
          ...(input.value != null && { value: input.value }),
        }).where(eq(attributeNumericValues.id, id)).returning())
        return row!
      }),

    deleteNumeric: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeNumericValues, id)
        const [row] = yield* dbErr(db.delete(attributeNumericValues).where(eq(attributeNumericValues.id, id)).returning())
        return row!
      }),

    // ── boolean ──
    createBoolean: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const [row] = yield* dbErr(db.insert(attributeBooleanValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          value: input.value,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
        }).returning())
        return row!
      }),

    updateBoolean: (id, input) =>
      Effect.gen(function* () {
        yield* ensureExists(attributeBooleanValues, id)
        const [row] = yield* dbErr(db.update(attributeBooleanValues).set({
          ...(input.value != null && { value: input.value }),
        }).where(eq(attributeBooleanValues.id, id)).returning())
        return row!
      }),

    deleteBoolean: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeBooleanValues, id)
        const [row] = yield* dbErr(db.delete(attributeBooleanValues).where(eq(attributeBooleanValues.id, id)).returning())
        return row!
      }),

    // ── date ──
    createDate: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const [row] = yield* dbErr(db.insert(attributeDateValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          value: input.value,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
        }).returning())
        return row!
      }),

    updateDate: (id, input) =>
      Effect.gen(function* () {
        yield* ensureExists(attributeDateValues, id)
        const [row] = yield* dbErr(db.update(attributeDateValues).set({
          ...(input.value != null && { value: input.value }),
        }).where(eq(attributeDateValues.id, id)).returning())
        return row!
      }),

    deleteDate: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeDateValues, id)
        const [row] = yield* dbErr(db.delete(attributeDateValues).where(eq(attributeDateValues.id, id)).returning())
        return row!
      }),

    // ── file ──
    createFile: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const [row] = yield* dbErr(db.insert(attributeFileValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          fileUrl: input.fileUrl,
          mimetype: input.mimetype,
          externalSource: input.externalSource ?? null,
          externalId: input.externalId ?? null,
        }).returning())
        return row!
      }),

    updateFile: (id, input) =>
      Effect.gen(function* () {
        yield* ensureExists(attributeFileValues, id)
        const [row] = yield* dbErr(db.update(attributeFileValues).set({
          ...(input.fileUrl != null && { fileUrl: input.fileUrl }),
          ...(input.mimetype != null && { mimetype: input.mimetype }),
        }).where(eq(attributeFileValues.id, id)).returning())
        return row!
      }),

    deleteFile: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeFileValues, id)
        const [row] = yield* dbErr(db.delete(attributeFileValues).where(eq(attributeFileValues.id, id)).returning())
        return row!
      }),
  } satisfies TypedValueServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(TypedValueService, make)
