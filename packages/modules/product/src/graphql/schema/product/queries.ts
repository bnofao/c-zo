// @czo/product GraphQL queries (Task 20a).
//
// Two read flavours:
//   - ADMIN by-id / list — gated by the owning org's `product:read` permission
//     (global rows → the user's global role via `{ auth: true }` defer). Lists
//     call the service `list*(orgId)` which already merges base ∪ org rows.
//   - STOREFRONT by-handle / by-slug — PUBLIC (no authScopes); org-scoping is
//     supplied by an explicit `viewerOrg` arg and enforced inside the service.
//
// DEFERRED — storefront access gate: these PUBLIC reads are an interim. They
// will be gated by a dedicated *publishable, channel-scoped API key* (front app
// reads the catalog with its key, logged-in or not) in a separate auth sprint —
// NOT by `product:read`. `product:read` is the admin/back-office perm: it sees
// unpublished + all base/org rows and would over-expose a storefront key, and
// it can't be satisfied by a key today (the `permission` scope and request-auth
// are session-only). Do not add `product:read` here; wire the publishable-key
// principal first, then gate to published-in-channel. (See memory: storefront
// API keys.)
//
// Channel-publication filtering is refined in Task 20b/E2E.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  AdoptionService,
  CategoryService,
  CollectionService,
  ProductService,
  ProductTypeService,
} from '../../../services'
import {
  loadCategoryOrganizationId,
  loadCollectionOrganizationId,
  loadProductOrganizationId,
  loadProductTypeOrganizationId,
} from './authz'

export function registerProductQueries(builder: ProductGraphQLSchemaBuilder): void {
  // ── productType(id) — admin single lookup ──────────────────────────────────
  builder.queryField('productType', t =>
    t.field({
      type: 'ProductType',
      nullable: true,
      description: 'Fetch a single product type by id (admin). A global type requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted.',
      args: { id: t.arg.globalID({ for: 'ProductType', required: true, description: 'The relay global id of the ProductType to fetch.' }) },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductTypeOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'product', actions: ['read'], organization } }
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.findTypeById(Number(args.id.id))
          }).pipe(Effect.catchTag('ProductTypeNotFound', () => Effect.succeed(null))),
        ) as Promise<any>,
    }))

  // ── productTypes(viewerOrg) — admin list (base ∪ org), org-gated ────────────
  builder.queryField('productTypes', t =>
    t.field({
      type: ['ProductType'],
      description: 'List product types visible to an org (admin): the org\'s own types merged with the global (platform) ones. Requires `product:read` in the given org.',
      args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose product types to list; global types are always included.' }) },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.viewerOrg.id) },
      }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            return yield* svc.listTypes(Number(args.viewerOrg.id))
          }),
        ) as Promise<any>,
    }))

  // ── product(id) — admin single lookup ──────────────────────────────────────
  builder.queryField('product', t =>
    t.field({
      type: 'Product',
      nullable: true,
      description: 'Fetch a single product by id (admin). A global product requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted.',
      args: { id: t.arg.globalID({ for: 'Product', required: true, description: 'The relay global id of the Product to fetch.' }) },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'product', actions: ['read'], organization } }
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.findProductById(Number(args.id.id))
          }).pipe(Effect.catchTag('ProductNotFound', () => Effect.succeed(null))),
        ) as Promise<any>,
    }))

  // ── productByHandle(handle, viewerOrg?) — PUBLIC storefront read ────────────
  builder.queryField('productByHandle', t =>
    t.field({
      type: 'Product',
      nullable: true,
      description: 'Storefront read: fetch a published-catalog product by its URL handle. With `viewerOrg` the lookup scopes to that org (its adopted/owned products); without it, only global (org-null) products are visible. Currently public — see the storefront access gate note. Returns null if no match in scope.',
      args: {
        handle: t.arg.string({ required: true, description: 'The product\'s URL handle, unique within its scope (global, or per owning org).' }),
        viewerOrg: t.arg.globalID({ for: 'Organization', required: false, description: 'Optional viewer organization; scopes the lookup to that org\'s products. Omit for the global catalog.' }),
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.findProductByHandle({
              orgId: args.viewerOrg ? Number(args.viewerOrg.id) : null,
              handle: args.handle,
            })
          }).pipe(Effect.catchTag('ProductNotFound', () => Effect.succeed(null))),
        ) as Promise<any>,
    }))

  // ── products(viewerOrg) — admin list (base ∪ org), org-gated ────────────────
  builder.queryField('products', t =>
    t.field({
      type: ['Product'],
      description: 'List products visible to an org (admin): the org\'s own products merged with the global (platform) ones. Requires `product:read` in the given org.',
      args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose products to list; global products are always included.' }) },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.viewerOrg.id) },
      }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.listProducts(Number(args.viewerOrg.id))
          }),
        ) as Promise<any>,
    }))

  // ── adoptedProducts(organization) — the acting org's adopted globals ────────
  builder.queryField('adoptedProducts', t =>
    t.field({
      type: ['Product'],
      description: 'List the global products an org has adopted (and may therefore graft org-scoped data onto). Requires `product:read` in the given org.',
      args: { organization: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose adopted global products to list.' }) },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.organization.id) },
      }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AdoptionService
            return yield* svc.listAdoptedProducts(Number(args.organization.id))
          }),
        ) as Promise<any>,
    }))

  // ── category(id) — admin single lookup ─────────────────────────────────────
  builder.queryField('category', t =>
    t.field({
      type: 'Category',
      nullable: true,
      description: 'Fetch a single category by id (admin). A global category requires the global `product:read` role; an org-owned one requires `product:read` in its org. Returns null if not found or soft-deleted.',
      args: { id: t.arg.globalID({ for: 'Category', required: true, description: 'The relay global id of the Category to fetch.' }) },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadCategoryOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'product', actions: ['read'], organization } }
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.findCategoryById(Number(args.id.id))
          }).pipe(Effect.catchTag('CategoryNotFound', () => Effect.succeed(null))),
        ) as Promise<any>,
    }))

  // ── categories(viewerOrg) — admin list (base ∪ org), org-gated ─────────────
  builder.queryField('categories', t =>
    t.field({
      type: ['Category'],
      description: 'List categories visible to an org (admin): the org\'s own categories merged with the global (platform) ones. Requires `product:read` in the given org.',
      args: { viewerOrg: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose categories to list; global categories are always included.' }) },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.viewerOrg.id) },
      }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.listCategories(Number(args.viewerOrg.id))
          }),
        ) as Promise<any>,
    }))

  // ── collection(id) — admin single lookup (collections are org-only) ────────
  builder.queryField('collection', t =>
    t.field({
      type: 'Collection',
      nullable: true,
      description: 'Fetch a single collection by id (admin). Collections are org-only; requires `product:read` in the owning org. Returns null if not found or soft-deleted.',
      args: { id: t.arg.globalID({ for: 'Collection', required: true, description: 'The relay global id of the Collection to fetch.' }) },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadCollectionOrganizationId(ctx, Number(args.id.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'product', actions: ['read'], organization } }
      },
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            return yield* svc.findCollectionById(Number(args.id.id))
          }).pipe(Effect.catchTag('CollectionNotFound', () => Effect.succeed(null))),
        ) as Promise<any>,
    }))

  // ── collections(organization) — admin list, org-gated ──────────────────────
  builder.queryField('collections', t =>
    t.field({
      type: ['Collection'],
      description: 'List an org\'s collections (admin). Collections are org-only (no global tier). Requires `product:read` in the given org.',
      args: { organization: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose collections to list.' }) },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.organization.id) },
      }),
      resolve: async (_root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            return yield* svc.listCollections(Number(args.organization.id))
          }),
        ) as Promise<any>,
    }))
}
