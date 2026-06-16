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
  CategoryService,
  CollectionService,
  ProductService,
  ProductTypeService,
  TaxonomyRequestService,
} from '../../../services'
import {
  loadCategoryOrganizationId,
  loadCollectionOrganizationId,
  loadProductOrganizationId,
  loadProductTypeOrganizationId,
} from './authz'
import { buildOrderBy, mergeWhere } from './types/merge'
import { buildProductWhere } from './types/where'

export function registerProductQueries(builder: ProductGraphQLSchemaBuilder): void {
  // ── productType(id) — admin single lookup ──────────────────────────────────
  builder.queryField('productType', t =>
    t.field({
      type: 'ProductType',
      nullable: true,
      subGraphs: ['org', 'admin'],
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

  // ── productTypes — PLATFORM global-only connection (admin curation) ──────────
  builder.queryField('productTypes', t =>
    t.drizzleConnection({
      type: 'productTypes',
      subGraphs: ['admin'],
      description: 'Paginated (relay) connection over the GLOBAL (platform) product types, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role.',
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      args: {
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductTypeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductTypeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [{ organizationId: { isNull: true } }, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findTypes(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationProductTypes — org connection (base ∪ org), org-gated ────────
  builder.queryField('organizationProductTypes', t =>
    t.drizzleConnection({
      type: 'productTypes',
      subGraphs: ['org'],
      description: 'Paginated (relay) connection over the product types visible to an org: the org\'s own merged with the global (platform) ones, with optional free-text search, filtering, and ordering. Requires `product:read` in the given org.',
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose product types to list; global types are always included.' }),
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductTypeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductTypeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductTypeService
            const base = mergeWhere(Number(args.organizationId.id))
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [base, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findTypes(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))

  // ── product(id) — admin single lookup ──────────────────────────────────────
  builder.queryField('product', t =>
    t.field({
      type: 'Product',
      nullable: true,
      subGraphs: ['org', 'admin'],
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
      subGraphs: ['public'],
      description: 'Storefront read: fetch a PUBLISHED product by its URL handle — only products live on a channel (≥1 published, approved, non-deleted channel listing) are returned; drafts/unpublished are never visible here. `viewerOrg` disambiguates: handle is unique per (org, handle), so it scopes the lookup to that org\'s adopted/owned products (omit for global, org-null products); it is NOT a draft-access grant. Currently public — see the storefront access gate note. Returns null if no published match in scope.',
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

  // ── products — PLATFORM global-only connection (admin curation) ─────────────
  builder.queryField('products', t =>
    t.drizzleConnection({
      type: 'products',
      subGraphs: ['admin'],
      description: 'Paginated (relay) connection over the GLOBAL (platform) products, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role.',
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      args: {
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { handle: { ilike: `%${s}%` } }] } : null
            const userWhere = args.where ? buildProductWhere(args.where) : null
            const where = { AND: [{ organizationId: { isNull: true } }, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findProducts(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationProducts — org connection (base ∪ org), org-gated ──────────
  builder.queryField('organizationProducts', t =>
    t.drizzleConnection({
      type: 'products',
      subGraphs: ['org'],
      description: 'Paginated (relay) connection over the products visible to an org: the org\'s own merged with the global (platform) ones, with optional free-text search, filtering, and ordering. Requires `product:read` in the given org.',
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose products to list; global products are always included.' }),
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            const base = mergeWhere(Number(args.organizationId.id))
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { handle: { ilike: `%${s}%` } }] } : null
            const userWhere = args.where ? buildProductWhere(args.where) : null
            const where = { AND: [base, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findProducts(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))

  // ── channelProducts — PUBLIC storefront catalog of a sales channel ──────────
  builder.queryField('channelProducts', t =>
    t.drizzleConnection({
      type: 'products',
      subGraphs: ['public'],
      description: 'Storefront catalog: paginated (relay) connection over the products live on a @czo/channel sales channel (a published, approved, non-deleted listing), with optional free-text search, filtering, and ordering. Public — publication is the gate.',
      args: {
        channel: t.arg.int({ required: true, description: 'Raw @czo/channel sales-channel id whose published catalog to read.' }),
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            const live = {
              channelListings: {
                channelId: args.channel,
                isPublished: true,
                reviewState: 'approved',
                deletedAt: { isNull: true },
              },
            }
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { handle: { ilike: `%${s}%` } }] } : null
            const userWhere = args.where ? buildProductWhere(args.where) : null
            const where = { AND: [{ deletedAt: { isNull: true } }, live, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findProducts(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['public'] }, { subGraphs: ['public'] }))

  // ── adoptedProducts(organization) — the acting org's adopted globals ────────
  builder.queryField('adoptedProducts', t =>
    t.drizzleConnection({
      type: 'products',
      subGraphs: ['org', 'admin'],
      description: 'Paginated (relay) connection over the global products an org has adopted. Requires `product:read` in the given org.',
      authScopes: (_p, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.organization.id) },
      }),
      args: {
        organization: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose adopted global products to list.' }),
        search: t.arg.string({ description: 'Free-text search across name and handle (case-insensitive substring).' }),
        where: t.arg({ type: 'ProductWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['ProductOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService

            // "Products with ≥1 live adoption by this org" — RQBv2 relational
            // `where` over the `adoptions` (productOrgAdoptions) many-relation.
            const orgId = Number(args.organization.id)
            const base = { adoptions: { organizationId: orgId, deletedAt: { isNull: true } }, deletedAt: { isNull: true } }
            // Free-text search → case-insensitive substring across name and handle.
            const s = args.search?.trim()
            const searchClause = s
              ? { OR: [{ name: { ilike: `%${s}%` } }, { handle: { ilike: `%${s}%` } }] }
              : null
            const userWhere = args.where ? buildProductWhere(args.where) : null
            const where = { AND: [base, userWhere, searchClause].filter(Boolean) }

            return yield* svc.findProducts(query({
              where: where as any,
              orderBy: buildOrderBy(args.orderBy),
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org', 'admin'] }, { subGraphs: ['org', 'admin'] }))

  // ── category(id) — admin single lookup ─────────────────────────────────────
  builder.queryField('category', t =>
    t.field({
      type: 'Category',
      nullable: true,
      subGraphs: ['org', 'admin'],
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

  // ── categories — PLATFORM global-only connection (admin curation) ──────────
  builder.queryField('categories', t =>
    t.drizzleConnection({
      type: 'categories',
      subGraphs: ['admin'],
      description: 'Paginated (relay) connection over the GLOBAL (platform) categories, for platform curation, with optional free-text search, filtering, and ordering. Requires the global `product:read` role.',
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      args: {
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'CategoryWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['CategoryOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [{ organizationId: { isNull: true } }, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findCategories(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationCategories — org connection (base ∪ org), org-gated ────────
  builder.queryField('organizationCategories', t =>
    t.drizzleConnection({
      type: 'categories',
      subGraphs: ['org'],
      description: 'Paginated (relay) connection over the categories visible to an org: the org\'s own merged with the global (platform) ones, with optional free-text search, filtering, and ordering. Requires `product:read` in the given org.',
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose categories to list; global categories are always included.' }),
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        where: t.arg({ type: 'CategoryWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['CategoryOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            const base = mergeWhere(Number(args.organizationId.id))
            const s = args.search?.trim()
            const searchClause = s ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] } : null
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [base, userWhere, searchClause].filter(Boolean) }
            return yield* svc.findCategories(query({ where: where as any, orderBy: buildOrderBy(args.orderBy) }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))

  // ── collection(id) — admin single lookup (collections are org-only) ────────
  builder.queryField('collection', t =>
    t.field({
      type: 'Collection',
      nullable: true,
      subGraphs: ['org', 'admin'],
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

  // ── collections(organization) — admin connection, org-gated ────────────────
  builder.queryField('collections', t =>
    t.drizzleConnection({
      type: 'collections',
      subGraphs: ['org', 'admin'],
      description: 'Paginated (relay) connection over an org\'s collections (admin). Collections are org-only (no global tier), with optional free-text search and ordering. Requires `product:read` in the given org.',
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['read'], organization: Number(args.organization.id) },
      }),
      args: {
        organization: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose collections to list.' }),
        search: t.arg.string({ description: 'Free-text search across name and slug (case-insensitive substring).' }),
        orderBy: t.arg({ type: ['CollectionOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService

            // Collections are org-only: scope strictly to the given org.
            const base = { organizationId: Number(args.organization.id) }
            // Free-text search → case-insensitive substring across name and slug.
            const s = args.search?.trim()
            const searchClause = s
              ? { OR: [{ name: { ilike: `%${s}%` } }, { slug: { ilike: `%${s}%` } }] }
              : null
            const where = { AND: [base, searchClause].filter(Boolean) }

            return yield* svc.findCollections(query({
              where: where as any,
              orderBy: buildOrderBy(args.orderBy),
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org', 'admin'] }, { subGraphs: ['org', 'admin'] }))

  // ── taxonomyRequests — admin moderation queue ───────────────────────────────
  builder.queryField('taxonomyRequests', t =>
    t.drizzleConnection({
      type: 'taxonomyRequests',
      subGraphs: ['admin'],
      description: 'Paginated (relay) connection over the taxonomy requests awaiting platform review, with optional filtering and ordering. Requires the global `product:read` role.',
      authScopes: { permission: { resource: 'product', actions: ['read'] } },
      args: {
        where: t.arg({ type: 'TaxonomyRequestWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['TaxonomyRequestOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TaxonomyRequestService

            // Admin sees all rows; only the caller's `where` constrains them.
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [userWhere].filter(Boolean) }

            return yield* svc.findRequests(query({
              where: where as any,
              orderBy: buildOrderBy(args.orderBy),
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationTaxonomyRequests — an org's own requests ─────────────────────
  builder.queryField('organizationTaxonomyRequests', t =>
    t.drizzleConnection({
      type: 'taxonomyRequests',
      subGraphs: ['org'],
      description: 'Paginated (relay) connection over the taxonomy requests submitted by an organization, with their state and any rejection reason, plus optional filtering and ordering. Requires `product:read` in that organization.',
      authScopes: (_p, args) => ({ permission: { resource: 'product', actions: ['read'], organization: Number(args.organizationId.id) } }),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'The organization whose requests to list.' }),
        where: t.arg({ type: 'TaxonomyRequestWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['TaxonomyRequestOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* TaxonomyRequestService

            // Scope strictly to the given org; the caller's `where` is AND-ed on.
            const base = { organizationId: Number(args.organizationId.id) }
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const where = { AND: [base, userWhere].filter(Boolean) }

            return yield* svc.findRequests(query({
              where: where as any,
              orderBy: buildOrderBy(args.orderBy),
            }))
          }),
        ) as Promise<any>,
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))
}
