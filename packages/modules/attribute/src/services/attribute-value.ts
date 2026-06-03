import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { FileInput } from './validation'
import { DrizzleDb } from '@czo/kit/db'
import { and, desc, eq, ne } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { attributeReferenceValues, attributeSwatchValues, attributeValues } from '../database/schema'
import { AttributeDbFailed } from './attribute'
import { generateSlug } from './utils/slug'
import { validateSwatchVisual } from './validation'

// One DB-failure definition for the whole module — re-exported from the
// attribute service rather than redefined, so callers route a single type.
export { AttributeDbFailed } from './attribute'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class AttributeValueNotFound extends Data.TaggedError('AttributeValueNotFound') {
  readonly code = 'ATTRIBUTE_VALUE_NOT_FOUND'
  get message() { return 'Attribute value not found' }
}

export class AttributeValueSlugTaken extends Data.TaggedError('AttributeValueSlugTaken')<{
  readonly slug: string
}> {
  readonly code = 'ATTRIBUTE_VALUE_SLUG_EXISTS'
  get message() { return `Attribute value slug '${this.slug}' already exists` }
}

export class SwatchRequiresColorOrFile extends Data.TaggedError('SwatchRequiresColorOrFile') {
  readonly code = 'SWATCH_REQUIRES_COLOR_OR_FILE'
  get message() { return 'Swatch needs a color or a file' }
}

/** A swatch visual is present but malformed (bad hex color, missing mimetype). */
export class SwatchVisualInvalid extends Data.TaggedError('SwatchVisualInvalid')<{
  readonly reason: string
}> {
  readonly code = 'VALIDATION_ERROR'
  get message() { return this.reason }
}

/**
 * A value may only be grafted onto a PLATFORM attribute (parent org null) or
 * onto an attribute owned by the SAME org as the value (spec §2 integrity rule).
 * Raised when a caller tries to add a value to another org's attribute. Shared
 * with the typed-value service (which imports it from here).
 */
export class AttributeParentNotOwned extends Data.TaggedError('AttributeParentNotOwned') {
  readonly code = 'ATTRIBUTE_PARENT_NOT_OWNED'
  get message() {
    return 'A value may only be added to a platform attribute or to an attribute owned by your organization'
  }
}

export type AttributeValueError
  = | AttributeValueNotFound
    | AttributeValueSlugTaken
    | SwatchRequiresColorOrFile
    | SwatchVisualInvalid
    | AttributeParentNotOwned
    | AttributeDbFailed

// ─── Domain models + input types ─────────────────────────────────────────────

export type AttributeValue = InferSelectModel<typeof attributeValues>
export type AttributeSwatchValue = InferSelectModel<typeof attributeSwatchValues>
export type AttributeReferenceValue = InferSelectModel<typeof attributeReferenceValues>

interface ChoiceCreateBase {
  attributeId: number
  value: string
  slug?: string
  position?: number
  organizationId: number | null
}

export type CreateValueInput = ChoiceCreateBase
export type UpdateValueInput = Partial<{ value: string, slug: string, position: number }>

export interface CreateSwatchInput extends ChoiceCreateBase {
  color?: string | null
  file?: FileInput | null
}
export type UpdateSwatchInput = Partial<{
  value: string
  slug: string
  position: number
  color: string | null
  file: FileInput | null
}>

export interface CreateReferenceInput extends ChoiceCreateBase {
  referenceId: number
}
export type UpdateReferenceInput = Partial<{ value: string, slug: string, position: number, referenceId: number }>

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type Fail<A, E = AttributeValueError> = Effect.Effect<A, E>

export class AttributeValueService extends Context.Service<
  AttributeValueService,
  {
    // value family
    readonly createValue: (input: CreateValueInput) => Fail<AttributeValue, AttributeValueSlugTaken | AttributeParentNotOwned | AttributeDbFailed>
    readonly updateValue: (id: number, input: UpdateValueInput) => Fail<AttributeValue, AttributeValueNotFound | AttributeValueSlugTaken | AttributeDbFailed>
    readonly deleteValue: (id: number) => Fail<AttributeValue, AttributeValueNotFound | AttributeDbFailed>
    readonly reorderValues: (attributeId: number, orderedIds: readonly number[]) => Fail<void, AttributeDbFailed>

    // swatch family
    readonly createSwatch: (input: CreateSwatchInput) => Fail<AttributeSwatchValue, AttributeValueSlugTaken | SwatchRequiresColorOrFile | SwatchVisualInvalid | AttributeParentNotOwned | AttributeDbFailed>
    readonly updateSwatch: (id: number, input: UpdateSwatchInput) => Fail<AttributeSwatchValue, AttributeValueNotFound | AttributeValueSlugTaken | SwatchRequiresColorOrFile | SwatchVisualInvalid | AttributeDbFailed>
    readonly deleteSwatch: (id: number) => Fail<AttributeSwatchValue, AttributeValueNotFound | AttributeDbFailed>
    readonly reorderSwatches: (attributeId: number, orderedIds: readonly number[]) => Fail<void, AttributeDbFailed>

    // reference family
    readonly createReference: (input: CreateReferenceInput) => Fail<AttributeReferenceValue, AttributeValueSlugTaken | AttributeParentNotOwned | AttributeDbFailed>
    readonly updateReference: (id: number, input: UpdateReferenceInput) => Fail<AttributeReferenceValue, AttributeValueNotFound | AttributeValueSlugTaken | AttributeDbFailed>
    readonly deleteReference: (id: number) => Fail<AttributeReferenceValue, AttributeValueNotFound | AttributeDbFailed>
    readonly reorderReferences: (attributeId: number, orderedIds: readonly number[]) => Fail<void, AttributeDbFailed>
  }
>()('@czo/attribute/AttributeValueService') {}

// ─── Layer ───────────────────────────────────────────────────────────────────

type AttributeValueServiceImpl = Context.Service.Shape<typeof AttributeValueService>

/** The three choice tables share these columns; the shared helpers operate over them. */
type ChoiceTable = typeof attributeValues | typeof attributeSwatchValues | typeof attributeReferenceValues

const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to AttributeDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new AttributeDbFailed({ cause })))

  // ── Shared building blocks (no whole-method copy-paste between families) ──

  /** Resolve the slug for a create/update — explicit, or generated from `value`. */
  const resolveSlug = (value: string | undefined, slug: string | undefined) =>
    slug ?? (value != null ? generateSlug(value) : undefined)

  /**
   * Pre-check `UNIQUE(attributeId, slug)`; fail on a duplicate. Racy under
   * concurrent inserts, but the DB constraint is the ultimate guard.
   * `exceptId` skips the row being updated.
   */
  const ensureSlugFree = (table: ChoiceTable, attributeId: number, slug: string, exceptId?: number) =>
    Effect.gen(function* () {
      const conds = [eq(table.attributeId, attributeId), eq(table.slug, slug)]
      if (exceptId !== undefined)
        conds.push(ne(table.id, exceptId))
      const [row] = yield* dbErr(db
        .select({ id: table.id })
        .from(table)
        .where(and(...conds))
        .limit(1))
      if (row)
        return yield* Effect.fail(new AttributeValueSlugTaken({ slug }))
    })

  /** Next position for an attribute: `max(position) + 1`, or 0 when none. */
  const nextPosition = (table: ChoiceTable, attributeId: number) =>
    Effect.gen(function* () {
      const [top] = yield* dbErr(db
        .select({ position: table.position })
        .from(table)
        .where(eq(table.attributeId, attributeId))
        .orderBy(desc(table.position))
        .limit(1))
      return top ? top.position + 1 : 0
    })

  /**
   * Integrity guard (spec §2): a value may be grafted ONLY onto a platform
   * attribute (parent org null) or onto an attribute owned by the SAME org as
   * the value. A missing parent fails (the FK would reject anyway). Never lets
   * a value be added to another org's attribute.
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

  /** Existence check by id; fail with NotFound when absent. */
  const ensureExists = (table: ChoiceTable, id: number) =>
    Effect.gen(function* () {
      const [row] = yield* dbErr(db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1))
      if (!row)
        return yield* Effect.fail(new AttributeValueNotFound())
    })

  /** Reindex `position = index` for each id in one transaction. */
  const reorder = (table: ChoiceTable, _attributeId: number, orderedIds: readonly number[]) =>
    dbErr(db.transaction(tx =>
      Effect.gen(function* () {
        for (let i = 0; i < orderedIds.length; i++) {
          yield* tx.update(table).set({ position: i }).where(eq(table.id, orderedIds[i]!))
        }
      }),
    ))

  return AttributeValueService.of({
    // ── value family ──
    createValue: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const slug = resolveSlug(input.value, input.slug)!
        yield* ensureSlugFree(attributeValues, input.attributeId, slug)
        const position = input.position ?? (yield* nextPosition(attributeValues, input.attributeId))
        // `CreateValueInput` is a 1:1 column DTO; spread it and override the
        // resolved slug/position. (Does NOT generalize to createSwatch, whose
        // `file` is a transient field split into fileUrl/mimetype.)
        const [created] = yield* dbErr(db.insert(attributeValues).values({
          ...input,
          slug,
          position,
        }).returning())
        return created!
      }),

    updateValue: (id, input) =>
      Effect.gen(function* () {
        const [existing] = yield* dbErr(db.select().from(attributeValues).where(eq(attributeValues.id, id)).limit(1))
        if (!existing)
          return yield* Effect.fail(new AttributeValueNotFound())
        const slug = resolveSlug(input.value, input.slug)
        if (slug != null && slug !== existing.slug)
          yield* ensureSlugFree(attributeValues, existing.attributeId, slug, id)
        const [updated] = yield* dbErr(db.update(attributeValues).set({
          ...(input.value != null && { value: input.value }),
          ...(slug != null && { slug }),
          ...(input.position != null && { position: input.position }),
        }).where(eq(attributeValues.id, id)).returning())
        return updated!
      }),

    deleteValue: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeValues, id)
        const [deleted] = yield* dbErr(db.delete(attributeValues).where(eq(attributeValues.id, id)).returning())
        return deleted!
      }),

    reorderValues: (attributeId, orderedIds) => reorder(attributeValues, attributeId, orderedIds),

    // ── swatch family ──
    createSwatch: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const visual = validateSwatchVisual({ color: input.color, file: input.file })
        if (!visual.ok) {
          if (visual.code === 'SWATCH_REQUIRES_COLOR_OR_FILE')
            return yield* Effect.fail(new SwatchRequiresColorOrFile())
          return yield* Effect.fail(new SwatchVisualInvalid({ reason: visual.message }))
        }
        const slug = resolveSlug(input.value, input.slug)!
        yield* ensureSlugFree(attributeSwatchValues, input.attributeId, slug)
        const position = input.position ?? (yield* nextPosition(attributeSwatchValues, input.attributeId))
        const [created] = yield* dbErr(db.insert(attributeSwatchValues).values({
          attributeId: input.attributeId,
          organizationId: input.organizationId,
          slug,
          value: input.value,
          color: input.color ?? null,
          fileUrl: input.file?.url ?? null,
          mimetype: input.file?.mimetype ?? null,
          position,
        }).returning())
        return created!
      }),

    updateSwatch: (id, input) =>
      Effect.gen(function* () {
        const [existing] = yield* dbErr(db.select().from(attributeSwatchValues).where(eq(attributeSwatchValues.id, id)).limit(1))
        if (!existing)
          return yield* Effect.fail(new AttributeValueNotFound())
        // Re-validate the resulting visual state when color/file is touched.
        if (input.color !== undefined || input.file !== undefined) {
          const color = input.color !== undefined ? input.color : existing.color
          const file = input.file !== undefined
            ? input.file
            : (existing.fileUrl != null ? { url: existing.fileUrl, mimetype: existing.mimetype ?? '' } : null)
          const visual = validateSwatchVisual({ color, file })
          if (!visual.ok) {
            if (visual.code === 'SWATCH_REQUIRES_COLOR_OR_FILE')
              return yield* Effect.fail(new SwatchRequiresColorOrFile())
            return yield* Effect.fail(new AttributeDbFailed({ cause: visual.message }))
          }
        }
        const slug = resolveSlug(input.value, input.slug)
        if (slug != null && slug !== existing.slug)
          yield* ensureSlugFree(attributeSwatchValues, existing.attributeId, slug, id)
        const [updated] = yield* dbErr(db.update(attributeSwatchValues).set({
          ...(input.value != null && { value: input.value }),
          ...(slug != null && { slug }),
          ...(input.position != null && { position: input.position }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.file !== undefined && { fileUrl: input.file?.url ?? null, mimetype: input.file?.mimetype ?? null }),
        }).where(eq(attributeSwatchValues.id, id)).returning())
        return updated!
      }),

    deleteSwatch: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeSwatchValues, id)
        const [deleted] = yield* dbErr(db.delete(attributeSwatchValues).where(eq(attributeSwatchValues.id, id)).returning())
        return deleted!
      }),

    reorderSwatches: (attributeId, orderedIds) => reorder(attributeSwatchValues, attributeId, orderedIds),

    // ── reference family ──
    createReference: input =>
      Effect.gen(function* () {
        yield* ensureParentOwned(input.attributeId, input.organizationId)
        const slug = resolveSlug(input.value, input.slug)!
        yield* ensureSlugFree(attributeReferenceValues, input.attributeId, slug)
        const position = input.position ?? (yield* nextPosition(attributeReferenceValues, input.attributeId))
        // `CreateReferenceInput` is a 1:1 column DTO (referenceId is a column);
        // spread it and override the resolved slug/position.
        const [created] = yield* dbErr(db.insert(attributeReferenceValues).values({
          ...input,
          slug,
          position,
        }).returning())
        return created!
      }),

    updateReference: (id, input) =>
      Effect.gen(function* () {
        const [existing] = yield* dbErr(db.select().from(attributeReferenceValues).where(eq(attributeReferenceValues.id, id)).limit(1))
        if (!existing)
          return yield* Effect.fail(new AttributeValueNotFound())
        const slug = resolveSlug(input.value, input.slug)
        if (slug != null && slug !== existing.slug)
          yield* ensureSlugFree(attributeReferenceValues, existing.attributeId, slug, id)
        const [updated] = yield* dbErr(db.update(attributeReferenceValues).set({
          ...(input.value != null && { value: input.value }),
          ...(slug != null && { slug }),
          ...(input.position != null && { position: input.position }),
          ...(input.referenceId != null && { referenceId: input.referenceId }),
        }).where(eq(attributeReferenceValues.id, id)).returning())
        return updated!
      }),

    deleteReference: id =>
      Effect.gen(function* () {
        yield* ensureExists(attributeReferenceValues, id)
        const [deleted] = yield* dbErr(db.delete(attributeReferenceValues).where(eq(attributeReferenceValues.id, id)).returning())
        return deleted!
      }),

    reorderReferences: (attributeId, orderedIds) => reorder(attributeReferenceValues, attributeId, orderedIds),
  } satisfies AttributeValueServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(AttributeValueService, make)
