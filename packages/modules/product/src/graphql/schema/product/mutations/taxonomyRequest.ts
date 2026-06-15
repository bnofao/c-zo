import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Attribute } from '@czo/attribute/services'
import { User } from '@czo/auth/services'
import { Effect } from 'effect'
import {
  CategoryAlreadyGlobal,
  CategoryNotFound,
  CategoryParentNotGlobal,
  CategorySlugTaken,
  ProductTypeAlreadyGlobal,
  ProductTypeNotFound,
  ProductTypeSlugTaken,
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

  // ── requestProductTypeCreation (org) ────────────────────────────────────────
  builder.relayMutationField(
    'requestProductTypeCreation',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization submitting the request; gated on `product:create` there.' }),
        name: t.string({ required: true, description: 'Proposed product type name.' }),
        slug: t.string({ required: true, description: 'Proposed slug, unique among global product types once approved.' }),
        isShippingRequired: t.boolean({ description: 'Whether products of this type require shipping. Defaults to true.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request for the platform to create a new GLOBAL product type (a bare type; attributes are added by the platform). Requires `product:create` in the organization.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitProductTypeCreation({
            organizationId: Number(args.input.organizationId.id),
            name: args.input.name,
            slug: args.input.slug,
            isShippingRequired: args.input.isShippingRequired ?? undefined,
          })
        }))
        return { request }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ request: t.field({ type: 'TaxonomyRequest', resolve: p => p.request, description: 'The created pending request.' }) }) },
  )

  // ── requestProductTypePromotion (org) ───────────────────────────────────────
  builder.relayMutationField(
    'requestProductTypePromotion',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The organization that owns the product type and is gated against.' }),
        productTypeId: t.int({ required: true, description: 'Id of the org-owned product type to promote to global.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Submits a request to promote an existing org-owned product type to GLOBAL. On approval the type — and the org-private attributes it declares, with their values — are made global. Requires `product:create` in the organization.',
      errors: { types: [ProductTypeNotFound, ProductTypeAlreadyGlobal], ...sg('org').errorOpts },
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const request = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.submitProductTypePromotion({ organizationId: Number(args.input.organizationId.id), productTypeId: args.input.productTypeId })
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
      description: 'Approves a taxonomy request: creates the global entity (create) or flips the org entity to global (promote). Requires the global `product:create` role; product-type requests additionally require the global `attribute:create` role.',
      errors: { types: [TaxonomyRequestNotFound, TaxonomyRequestNotPending, CategoryNotFound, CategoryAlreadyGlobal, CategoryParentNotGlobal, CategorySlugTaken, ProductTypeNotFound, ProductTypeAlreadyGlobal, ProductTypeSlugTaken, Attribute.AttributeNotFound], ...sg('admin').errorOpts },
      // Always requires GLOBAL `product:create`; product-type requests
      // additionally require GLOBAL `attribute:create` (the approval co-promotes
      // the type's org-private attributes). The scope-auth `$all` combinator
      // takes a single scope MAP, so two same-keyed `permission` scopes can't be
      // expressed declaratively — evaluate both globally (AND) as one boolean.
      authScopes: async (_p, args, ctx) => {
        const userId = ctx.auth?.user?.id
        if (!userId)
          return false
        const req = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* TaxonomyRequestService
          return yield* svc.findById(Number(args.input.requestId.id))
        }))
        const permissions: Record<string, string[]> = req?.entityType === 'product_type'
          ? { product: ['create'], attribute: ['create'] }
          : { product: ['create'] }
        return ctx.runEffect(Effect.gen(function* () {
          const users = yield* User.UserService
          return yield* users.hasPermission({ role: ctx.auth?.user?.role ?? undefined, permissions })
        }))
      },
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
