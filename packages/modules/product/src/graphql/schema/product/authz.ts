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
 * Ownership lookup for a by-id product-domain row. Distinguishes the three cases
 * a by-id authScope must gate differently — crucially keeping "not found" apart
 * from "global", which a bare `number | null` conflates:
 *   - `{ found: false }`                       → no live row (never existed / soft-deleted)
 *   - `{ found: true, organizationId: null }`  → a global/platform row
 *   - `{ found: true, organizationId: <n> }`   → an org-owned row
 */
export type OwnerLookup
  = | { readonly found: false }
    | { readonly found: true, readonly organizationId: number | null }

/**
 * Build the `permission` auth-scope for a by-id product-domain operation from an
 * {@link OwnerLookup}:
 *   - not found         → `{ auth: true }`: do NOT mask a missing/soft-deleted row
 *     as a 403; let the resolver/service surface its typed NotFound instead.
 *   - global (org null) → the GLOBAL `product:<action>` role (org-less `permission`
 *     scope) — the same gate as the global list/by-id reads.
 *   - org-owned         → `product:<action>` in the owning org.
 */
export function ownerScope(lookup: OwnerLookup, actions: string[]) {
  if (!lookup.found)
    return { auth: true }
  if (lookup.organizationId == null)
    return { permission: { resource: 'product', actions } }
  return { permission: { resource: 'product', actions, organization: lookup.organizationId } }
}

export function loadProductOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ProductService
      const row = yield* svc.findProductById(id).pipe(
        Effect.catchTag('ProductNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}

export function loadVariantOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* VariantService
      const row = yield* svc.findVariantById(id).pipe(
        Effect.catchTag('VariantNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}

export function loadProductTypeOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* ProductTypeService
      const row = yield* svc.findTypeById(id).pipe(
        Effect.catchTag('ProductTypeNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}

export function loadCategoryOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* CategoryService
      const row = yield* svc.findCategoryById(id).pipe(
        Effect.catchTag('CategoryNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}

export function loadCollectionOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* CollectionService
      const row = yield* svc.findCollectionById(id).pipe(
        Effect.catchTag('CollectionNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}

export function loadMediaOrganizationId(ctx: GraphQLContextMap, id: number): Promise<OwnerLookup> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const svc = yield* MediaService
      const row = yield* svc.findMediaById(id).pipe(
        Effect.catchTag('MediaNotFound', () => Effect.succeed(null)),
      )
      return row ? { found: true as const, organizationId: row.organizationId } : { found: false as const }
    }),
  )
}
