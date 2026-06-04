import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { attributeTypeEnum, attributeUnitEnum } from '../database/schema'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { attributes } from '../database/schema'
import { generateSlug } from './utils/slug'
import { validateReferenceAttribute } from './validation'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class AttributeNotFound extends Data.TaggedError('AttributeNotFound') {
  readonly code = 'ATTRIBUTE_NOT_FOUND'
  get message() { return 'Attribute not found' }
}

export class AttributeSlugTaken extends Data.TaggedError('AttributeSlugTaken')<{
  readonly slug: string
}> {
  readonly code = 'ATTRIBUTE_SLUG_EXISTS'
  get message() { return `Attribute slug '${this.slug}' already exists` }
}

export class AttributeDbFailed extends Data.TaggedError('AttributeDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'ATTRIBUTE_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Type-invariant errors (mirror the DB CHECK constraints, but as clean,
// client-facing validation errors instead of an opaque AttributeDbFailed) ───

/** A REFERENCE attribute must name the entity it references. */
export class ReferenceEntityRequired extends Data.TaggedError('ReferenceEntityRequired') {
  readonly code = 'REFERENCE_ENTITY_REQUIRED'
  get message() { return 'A REFERENCE attribute requires a referenceEntity' }
}

/** `referenceEntity` only makes sense on a REFERENCE attribute. */
export class ReferenceEntityNotAllowed extends Data.TaggedError('ReferenceEntityNotAllowed') {
  readonly code = 'REFERENCE_ENTITY_NOT_ALLOWED'
  get message() { return 'referenceEntity is only valid for a REFERENCE attribute' }
}

/** `unit` only makes sense on a NUMERIC attribute (optional even then). */
export class UnitNotAllowed extends Data.TaggedError('UnitNotAllowed') {
  readonly code = 'UNIT_NOT_ALLOWED'
  get message() { return 'unit is only valid for a NUMERIC attribute' }
}

// Re-export so GraphQL/callers route the lock error without redefining it.
export { OptimisticLockError }

export type AttributeError
  = | AttributeNotFound
    | AttributeSlugTaken
    | ReferenceEntityRequired
    | ReferenceEntityNotAllowed
    | UnitNotAllowed
    | AttributeDbFailed
    | OptimisticLockError

// ─── Domain model + types ────────────────────────────────────────────────────

export type Attribute = InferSelectModel<typeof attributes>

type AttributeType = (typeof attributeTypeEnum.enumValues)[number]
type AttributeUnit = (typeof attributeUnitEnum.enumValues)[number]

export interface CreateAttributeInput {
  name: string
  slug?: string
  type: AttributeType
  referenceEntity?: string | null
  unit?: AttributeUnit | null
  isRequired?: boolean
  isFilterable?: boolean
  externalSource?: string | null
  externalId?: string | null
  metadata?: unknown
  /** `null` = platform-wide attribute; a number scopes it to an organization. */
  organizationId: number | null
}

export type UpdateAttributeInput = Partial<{
  name: string
  isRequired: boolean
  isFilterable: boolean
  unit: AttributeUnit | null
  externalSource: string | null
  externalId: string | null
  metadata: unknown
}>

/** Read visibility scope: `null` = admin (sees everything), a number = an org. */
export interface ReadScope {
  organizationId: number | null
}

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['attributes']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['attributes']['findMany']>[0]
type AttributeWhere = NonNullable<NonNullable<FindManyConfig>['where']>

export class AttributeService extends Context.Service<
  AttributeService,
  {
    /**
     * Single-row read via Drizzle RQBv2. Applies the org-visibility filter:
     * a row is visible when its `organizationId` is NULL (platform) or matches
     * `scope.organizationId`. When `scope.organizationId == null` (admin), no
     * org filter is applied — every row is visible. Fails with
     * `AttributeNotFound` if no row matches.
     */
    readonly findFirst: (
      config: FindFirstConfig | undefined,
      scope: ReadScope,
    ) => Effect.Effect<Attribute, AttributeNotFound | AttributeDbFailed>

    /**
     * Multi-row read via Drizzle RQBv2. Same visibility rule as `findFirst`.
     * Returns an empty array on no match (never fails with NotFound).
     */
    readonly findMany: (
      config: FindManyConfig | undefined,
      scope: ReadScope,
    ) => Effect.Effect<readonly Attribute[], AttributeDbFailed>

    /**
     * Look up a single attribute by id with NO visibility filter (any org or
     * platform). For existence checks and admin/cross-org lookups (e.g. deriving
     * a resource's owning org for the authz gate). Fails NotFound when absent.
     */
    readonly findById: (
      id: number,
    ) => Effect.Effect<Attribute, AttributeNotFound | AttributeDbFailed>

    /**
     * Single-row read via Drizzle RQBv2 with NO visibility filter — the unscoped
     * sibling of `findFirst`. Takes the same Pothos `query()` config (so nested
     * selections / relations still load), but applies no org `where`.
     * Authorization is the GraphQL layer's job (it gates on the looked-up row's
     * own org). Fails NotFound when absent.
     */
    readonly findFirstUnscoped: (
      config: FindFirstConfig | undefined,
    ) => Effect.Effect<Attribute, AttributeNotFound | AttributeDbFailed>

    // Authorization (org membership + permission) is enforced at the GraphQL
    // layer — the service trusts its callers for authz. It DOES carry the
    // business invariants: slug uniqueness, and the type rules (referenceEntity
    // iff REFERENCE; unit only for NUMERIC).
    readonly create: (
      input: CreateAttributeInput,
    ) => Effect.Effect<
      Attribute,
      AttributeSlugTaken | ReferenceEntityRequired | ReferenceEntityNotAllowed | UnitNotAllowed | AttributeDbFailed
    >

    readonly update: (
      id: number,
      expectedVersion: number,
      input: UpdateAttributeInput,
    ) => Effect.Effect<
      Attribute,
      AttributeNotFound | UnitNotAllowed | OptimisticLockError | AttributeDbFailed
    >

    /**
     * Hard-delete the row (DB CASCADE removes all child value rows). Returns the
     * deleted row.
     */
    readonly delete: (
      id: number,
    ) => Effect.Effect<Attribute, AttributeNotFound | AttributeDbFailed>
  }
>()('@czo/attribute/AttributeService') {}

// ─── Layer ───────────────────────────────────────────────────────────────────

type AttributeServiceImpl = Context.Service.Shape<typeof AttributeService>

/**
 * Org-visibility predicate for RQBv2 `where`, from the caller's org perspective:
 *   • `organizationId == null` (no active org) → **platform rows only**.
 *   • `organizationId == N`                     → platform rows ∪ that org's rows.
 *
 * `null` is NOT an admin "see everything" scope — a caller without an active org
 * must never see other orgs' rows. To find a row regardless of org (existence
 * checks, admin/cross-org lookups) use `findById`, which applies no visibility
 * filter.
 *
 * The org-scope branch keys the filter on `OR`, and `findFirst`/`findMany` merge
 * it as `{ ...visible(scope), ...config?.where }`. Callers MUST therefore pass
 * only flat field filters in `config.where` — a `config.where.OR` would
 * overwrite the visibility `OR` and silently bypass org scoping. Compose extra
 * disjunctions with `AND`-ed flat fields, never a top-level `OR`.
 */
function visible(scope: ReadScope): AttributeWhere {
  return scope.organizationId == null
    ? { organizationId: { isNull: true } }
    : { OR: [{ organizationId: { isNull: true } }, { organizationId: scope.organizationId }] }
}

const make = Effect.gen(function* () {
  // Narrow the kit's bare `DrizzleDb` to `Database<Relations>` so RQBv2 query
  // inference matches this module's schema. Same runtime client.
  const db = (yield* DrizzleDb) as Database<Relations>

  /** Map any DB-layer error to AttributeDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new AttributeDbFailed({ cause })))

  /** Map a DB-layer error, preserving OptimisticLockError in the error channel. */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new AttributeDbFailed({ cause: e })),
    )

  const findFirst: AttributeServiceImpl['findFirst'] = (config, scope) =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.attributes.findFirst({
        ...config,
        where: { ...visible(scope), ...config?.where },
      }))
      if (!row)
        return yield* Effect.fail(new AttributeNotFound())
      return row
    })

  const findById: AttributeServiceImpl['findById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.attributes.findFirst({ where: { id } }))
      if (!row)
        return yield* Effect.fail(new AttributeNotFound())
      return row
    })

  const findFirstUnscoped: AttributeServiceImpl['findFirstUnscoped'] = config =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.attributes.findFirst({ ...config }))
      if (!row)
        return yield* Effect.fail(new AttributeNotFound())
      return row
    })

  return AttributeService.of({
    findFirst,

    findMany: (config, scope) =>
      dbErr(db.query.attributes.findMany({
        ...config,
        where: { ...visible(scope), ...config?.where },
      })),

    findById,

    findFirstUnscoped,

    create: input =>
      Effect.gen(function* () {
        // Type invariants (mirror the DB CHECK constraints): a REFERENCE
        // attribute requires a referenceEntity, and any other type forbids it;
        // `unit` is only valid on a NUMERIC attribute.
        const ref = validateReferenceAttribute(input.type, input.referenceEntity)
        if (!ref.ok) {
          return yield* Effect.fail(
            ref.code === 'REFERENCE_ENTITY_REQUIRED'
              ? new ReferenceEntityRequired()
              : new ReferenceEntityNotAllowed(),
          )
        }
        if (input.unit != null && input.type !== 'NUMERIC')
          return yield* Effect.fail(new UnitNotAllowed())

        const slug = input.slug ?? generateSlug(input.name)

        // Pre-check slug uniqueness — racy under concurrent inserts, but the
        // `uq_attributes_slug` constraint is the ultimate guard.
        const existing = yield* dbErr(db.query.attributes.findFirst({
          columns: { id: true },
          where: { slug },
        }))
        if (existing)
          return yield* Effect.fail(new AttributeSlugTaken({ slug }))

        // `input` is a 1:1 column DTO; `undefined` fields fall through to the
        // column defaults (NULL, or false for the boolean flags). `slug`
        // overrides the (optional) input slug with the resolved one.
        const [created] = yield* dbErr(db
          .insert(attributes)
          .values({ ...input, slug })
          .returning())

        return created!
      }),

    update: (id, expectedVersion, input) =>
      Effect.gen(function* () {
        // Unscoped existence check (any org/platform) — the per-org authz gate
        // is enforced at the GraphQL layer. A missing row is NotFound (404),
        // distinct from the version-mismatch OptimisticLockError that
        // `optimisticUpdate` raises.
        const existing = yield* findById(id)

        // `type` is immutable post-create, so validate the incoming `unit`
        // against the stored type: `unit` is only valid on a NUMERIC attribute.
        if (input.unit != null && existing.type !== 'NUMERIC')
          return yield* Effect.fail(new UnitNotAllowed())

        return yield* dbErrOptimistic(
          optimisticUpdate({ db, table: attributes, id, expectedVersion, values: input }),
        )
      }),

    delete: id =>
      Effect.gen(function* () {
        // Unscoped existence check. DB CASCADE removes child value rows.
        yield* findById(id)

        const [deleted] = yield* dbErr(db
          .delete(attributes)
          .where(eq(attributes.id, id))
          .returning())

        return deleted!
      }),
  } satisfies AttributeServiceImpl)
})

/** Live layer. */
export const layer = Layer.effect(AttributeService, make)
