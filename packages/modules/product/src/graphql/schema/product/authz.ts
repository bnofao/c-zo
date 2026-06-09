import type { GraphQLContextMap } from '@czo/kit/graphql'
import { Effect } from 'effect'
import {
  CategoryService,
  CollectionService,
  MediaService,
  ProductService,
  ProductTypeService,
  VariantService,
} from '../../../services'

/**
 * Resolve a row's organization id from its numeric id, so a by-id field (and
 * the relay `node(id:)` guard in Task 21) can authorize against the owning org
 * via auth's `permission` scope.
 *
 * Returns `null` when no live row matches (never existed or soft-deleted), or
 * when the row is global (`organizationId` is null). Callers treat `null` as
 * "unknown / global resource" and grant `{ auth: true }`, deferring to the
 * resolver/service NotFound rather than masking it as a gate 403 — the
 * org-permission check needs a real org.
 */
export function loadProductOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ProductService
      const row = yield* svc.findProductById(id).pipe(
        Effect.catchTag('ProductNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a variant's organization id from its numeric id.
 */
export function loadVariantOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* VariantService
      const row = yield* svc.findVariantById(id).pipe(
        Effect.catchTag('VariantNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a product type's organization id from its numeric id.
 */
export function loadProductTypeOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ProductTypeService
      const row = yield* svc.findTypeById(id).pipe(
        Effect.catchTag('ProductTypeNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a category's organization id from its numeric id.
 */
export function loadCategoryOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* CategoryService
      const row = yield* svc.findCategoryById(id).pipe(
        Effect.catchTag('CategoryNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a collection's organization id from its numeric id.
 */
export function loadCollectionOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* CollectionService
      const row = yield* svc.findCollectionById(id).pipe(
        Effect.catchTag('CollectionNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}

/**
 * Resolve a media row's organization id from its numeric id.
 */
export function loadMediaOrganizationId(ctx: GraphQLContextMap, id: number): Promise<number | null> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* MediaService
      const row = yield* svc.findMediaById(id).pipe(
        Effect.catchTag('MediaNotFound', () => Effect.succeed(null)),
      )
      return row?.organizationId ?? null
    }),
  )
}
