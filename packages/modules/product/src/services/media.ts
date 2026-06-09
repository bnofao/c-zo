import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Relations } from '../database/relations'
import type { ProductNotAdopted } from './adoption'
import { DrizzleDb, OptimisticLockError, optimisticUpdate } from '@czo/kit/db'
import { sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'
import { productMedia as productMediaTable, variantMedia as variantMediaTable } from '../database/schema'
import { AdoptionService } from './adoption'
import { ProductService } from './product'
import { VariantService } from './variant'

// ─── Re-export for callers that only import from this file ────────────────────

export { ProductNotAdopted } from './adoption'

// ─── Tagged errors ────────────────────────────────────────────────────────────

export class MediaNotFound extends Data.TaggedError('MediaNotFound')<{ readonly id: number }> {
  readonly code = 'MEDIA_NOT_FOUND'
  get message() { return `Media ${this.id} not found` }
}

export class MediaDbFailed extends Data.TaggedError('MediaDbFailed')<{ readonly cause: unknown }> {
  readonly code = 'MEDIA_DB_FAILED'
  get message() { return 'Database operation failed' }
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export type ProductMedia = InferSelectModel<typeof productMediaTable>
export type VariantMedia = InferSelectModel<typeof variantMediaTable>
export type MediaType = ProductMedia['type']

// ─── Input types ──────────────────────────────────────────────────────────────

export interface AddMediaInput {
  productId: number
  organizationId: number | null
  url: string
  alt?: string
  type?: MediaType
  position?: number
}

export interface UpdateMediaInput {
  id: number
  version: number
  url?: string
  alt?: string
  type?: MediaType
  position?: number
}

export interface LinkVariantMediaInput {
  variantId: number
  mediaId: number
}

// ─── Service contract ─────────────────────────────────────────────────────────

export class MediaService extends Context.Service<MediaService, {
  readonly addMedia: (input: AddMediaInput) => Effect.Effect<ProductMedia, ProductNotAdopted | MediaDbFailed>
  readonly updateMedia: (input: UpdateMediaInput) => Effect.Effect<ProductMedia, MediaNotFound | OptimisticLockError | MediaDbFailed>
  readonly removeMedia: (id: number, version: number) => Effect.Effect<ProductMedia, MediaNotFound | OptimisticLockError | MediaDbFailed>
  readonly findMediaById: (id: number) => Effect.Effect<ProductMedia, MediaNotFound | MediaDbFailed>
  readonly listProductMedia: (input: { productId: number, orgId: number }) => Effect.Effect<ReadonlyArray<ProductMedia>, MediaDbFailed>
  readonly linkVariantMedia: (input: LinkVariantMediaInput) => Effect.Effect<VariantMedia, MediaNotFound | MediaDbFailed>
  readonly unlinkVariantMedia: (input: LinkVariantMediaInput) => Effect.Effect<void, MediaDbFailed>
  readonly listVariantMedia: (variantId: number) => Effect.Effect<ReadonlyArray<ProductMedia>, MediaDbFailed>
}>()('@czo/product/MediaService') {}

type MediaServiceImpl = Context.Service.Shape<typeof MediaService>

// ─── Implementation ───────────────────────────────────────────────────────────

export const make = Effect.gen(function* () {
  const db = (yield* DrizzleDb) as Database<Relations>
  const productService = yield* ProductService
  const variantService = yield* VariantService
  const adoptionService = yield* AdoptionService

  /** Map any DB-layer error to MediaDbFailed. */
  const dbErr = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(Effect.mapError(cause => new MediaDbFailed({ cause })))

  /** Preserve OptimisticLockError; map everything else to MediaDbFailed. */
  const dbErrOptimistic = <A, E>(eff: Effect.Effect<A, E>) =>
    eff.pipe(
      Effect.mapError(e => e instanceof OptimisticLockError ? e : new MediaDbFailed({ cause: e })),
    )

  const findMediaById: MediaServiceImpl['findMediaById'] = id =>
    Effect.gen(function* () {
      const row = yield* dbErr(db.query.productMedia.findFirst({
        where: { id, deletedAt: { isNull: true } },
      }))
      if (!row)
        return yield* Effect.fail(new MediaNotFound({ id }))
      return row as ProductMedia
    })

  /**
   * Adoption guard: an org graft (organizationId non-null) onto a global product
   * (org null) requires a live adoption. Base media (org null) and org-owned
   * products skip the check.
   */
  const guardAdopted = (productId: number, organizationId: number | null) =>
    Effect.gen(function* () {
      if (organizationId === null)
        return
      const product = yield* productService.findProductById(productId).pipe(
        Effect.mapError(e => new MediaDbFailed({ cause: e })),
      )
      if (product.organizationId === null)
        yield* adoptionService.requireAdopted({ productId: product.id, orgId: organizationId })
    })

  const addMedia: MediaServiceImpl['addMedia'] = input =>
    Effect.gen(function* () {
      yield* guardAdopted(input.productId, input.organizationId)
      const [row] = yield* dbErr(db.insert(productMediaTable).values({
        productId: input.productId,
        organizationId: input.organizationId,
        url: input.url,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      }).returning())
      return row! as ProductMedia
    })

  const updateMedia: MediaServiceImpl['updateMedia'] = input =>
    Effect.gen(function* () {
      yield* findMediaById(input.id)
      return yield* dbErrOptimistic(
        optimisticUpdate({
          db,
          table: productMediaTable,
          id: input.id,
          expectedVersion: input.version,
          values: {
            ...(input.url !== undefined ? { url: input.url } : {}),
            ...(input.alt !== undefined ? { alt: input.alt } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
          },
        }),
      )
    })

  const removeMedia: MediaServiceImpl['removeMedia'] = (id, version) =>
    Effect.gen(function* () {
      yield* findMediaById(id)
      return yield* dbErrOptimistic(
        optimisticUpdate({ db, table: productMediaTable, id, expectedVersion: version, values: { deletedAt: sql`NOW()` as any } }),
      )
    })

  const listProductMedia: MediaServiceImpl['listProductMedia'] = ({ productId, orgId }) =>
    dbErr(db.query.productMedia.findMany({
      where: {
        productId,
        deletedAt: { isNull: true },
        OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }],
      },
    })) as Effect.Effect<ReadonlyArray<ProductMedia>, MediaDbFailed>

  const linkVariantMedia: MediaServiceImpl['linkVariantMedia'] = ({ variantId, mediaId }) =>
    Effect.gen(function* () {
      // The media must belong to the variant's product.
      const variant = yield* variantService.findVariantById(variantId).pipe(
        Effect.mapError(e => e._tag === 'VariantNotFound' ? new MediaNotFound({ id: mediaId }) : new MediaDbFailed({ cause: e })),
      )
      const media = yield* findMediaById(mediaId)
      if (media.productId !== variant.productId)
        return yield* Effect.fail(new MediaNotFound({ id: mediaId }))

      // Idempotent: a duplicate link is a no-op that returns the existing row.
      const [row] = yield* dbErr(db
        .insert(variantMediaTable)
        .values({ variantId, mediaId })
        .onConflictDoUpdate({
          target: [variantMediaTable.variantId, variantMediaTable.mediaId],
          set: { mediaId },
        })
        .returning())
      return row! as VariantMedia
    })

  const unlinkVariantMedia: MediaServiceImpl['unlinkVariantMedia'] = ({ variantId, mediaId }) =>
    dbErr(db.delete(variantMediaTable).where(
      sql`${variantMediaTable.variantId} = ${variantId} AND ${variantMediaTable.mediaId} = ${mediaId}`,
    )).pipe(Effect.asVoid)

  const listVariantMedia: MediaServiceImpl['listVariantMedia'] = variantId =>
    Effect.gen(function* () {
      const links = yield* dbErr(db.query.variantMedia.findMany({
        where: { variantId },
        with: { media: true },
      }))
      return links
        .map(l => (l as typeof l & { media: ProductMedia }).media)
        .filter((m): m is ProductMedia => m !== undefined && m !== null && m.deletedAt === null)
    })

  return {
    addMedia,
    updateMedia,
    removeMedia,
    findMediaById,
    listProductMedia,
    linkVariantMedia,
    unlinkVariantMedia,
    listVariantMedia,
  } satisfies MediaServiceImpl
})

export const MediaServiceLive = Layer.effect(MediaService, make)
