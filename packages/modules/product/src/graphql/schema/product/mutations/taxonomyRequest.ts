import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategorySlugTaken,
  TaxonomyRequestNotFound,
  TaxonomyRequestNotPending,
  TaxonomyRequestService,
} from '../../../../services'
import { sg } from '../subgraphs'

export function registerTaxonomyRequestMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── requestCategoryCreation (org) ───────────────────────────────────────────
  builder.relayMutationField(
    'requestCategoryCreation',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization submitting the request; gated on `product:create` there.' }),
        name: t.string({ required: true, description: 'Proposed category name.' }),
        slug: t.string({ required: true, description: 'Proposed URL-friendly slug, unique among global categories once approved.' }),
        description: t.string({ description: 'Optional proposed description.' }),
        parentId: t.int({ description: 'Optional global parent category id; must already be global at approval.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request for the platform to create a new GLOBAL category. Requires `product:create` in the organization. The category does not exist until an admin approves.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitCategoryCreation({
            organizationId: Number(args.input.organizationId.id),
            name: args.input.name,
            slug: args.input.slug,
            description: args.input.description ?? undefined,
            parentId: args.input.parentId ?? undefined,
          })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  // ── requestCategoryPromotion (org) ──────────────────────────────────────────
  builder.relayMutationField(
    'requestCategoryPromotion',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization that owns the category and is gated against.' }),
        categoryId: t.int({ required: true, description: 'Id of the org-owned category to promote to global.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request to promote an existing org-owned category to GLOBAL. Requires `product:create` in the organization. On approval the category\'s organization is cleared.',
      errors: { types: [CategoryNotFound, CategoryAlreadyGlobal], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitCategoryPromotion({ organizationId: Number(args.input.organizationId.id), categoryId: args.input.categoryId })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  const adminScope = () => ({ permission: { resource: 'product', actions: ['create'] } })

  // ── approveTaxonomyRequest (admin) ──────────────────────────────────────────
  builder.relayMutationField(
    'approveTaxonomyRequest',
    {
      ...sg('admin').input,
      inputFields: t => ({ requestId: t.globalID({ for: 'TaxonomyRequest', required: true, description: 'Global ID of the request to approve.' }) }),
    },
    {
      ...sg('admin').field,
      description: 'Approves a taxonomy request: creates the global entity (create) or flips the org entity to global (promote). Requires the global `product:create` role.',
      errors: { types: [TaxonomyRequestNotFound, TaxonomyRequestNotPending, CategoryNotFound, CategoryAlreadyGlobal, CategoryParentNotGlobal, CategorySlugTaken], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.approve(Number(args.input.requestId.id))
        }))
        return { request }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The approved request.' }) }) },
  )

  // ── rejectTaxonomyRequest (admin) ───────────────────────────────────────────
  builder.relayMutationField(
    'rejectTaxonomyRequest',
    {
      ...sg('admin').input,
      inputFields: t => ({
        requestId: t.globalID({ for: 'TaxonomyRequest', required: true, description: 'Global ID of the request to reject.' }),
        reason: t.string({ required: true, description: 'Why the request is rejected; surfaced to the org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Rejects a taxonomy request with a reason. Requires the global `product:create` role.',
      errors: { types: [TaxonomyRequestNotFound, TaxonomyRequestNotPending], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.reject(Number(args.input.requestId.id), args.input.reason)
        }))
        return { request }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The rejected request.' }) }) },
  )
}
