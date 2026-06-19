// Category mutations (Task 20a).
//
// Dual authz (switch-on-null): a GLOBAL category (organizationId null) gates on
// the user's global `product` perm; an org-owned one gates on that org.
// placeProduct/removePlacement: a base placement (organizationId null) is a
// global graft → global perm; an org placement → that org.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  CategoryCycle,
  CategoryNotFound,
  CategoryService,
  CategorySlugTaken,
} from '../../../../services'
import { loadCategoryOrganizationId, ownerScope } from '../authz'
import { sg } from '../subgraphs'

export function registerCategoryMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createCategory — PLATFORM (global base category) ─────────────────────────
  // Tier split (mirrors @czo/attribute): unqualified = GLOBAL (no org input,
  // global role); `createOrganizationCategory` = org-owned.
  builder.relayMutationField(
    'createCategory',
    {
      ...sg('admin').input,
      inputFields: t => ({
        name: t.string({ required: true, description: 'The display name of the category.' }),
        slug: t.string({ required: true, description: 'The URL-friendly identifier, unique within the category\'s scope.' }),
        description: t.string({ description: 'An optional long-form description of the category.' }),
        parentId: t.int({ description: 'The id of the parent category in the tree; omit to create the category at the root.' }),
        position: t.int({ description: 'The ordering position among sibling categories.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Creates a GLOBAL (base) category, gated on the global `product` create permission.',
      errors: { types: [CategoryNotFound, CategorySlugTaken], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'product', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.createCategory({
              organizationId: null,
              name: input.name,
              slug: input.slug,
              description: input.description ?? undefined,
              parentId: input.parentId ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { category }
      },
    },
    { ...sg('admin').payload, outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The newly created global category.' }) }) },
  )

  // ── createOrganizationCategory — ORG-owned category ──────────────────────────
  builder.relayMutationField(
    'createOrganizationCategory',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'The Organization that will own the category; gated on `product:create` in that organization.' }),
        name: t.string({ required: true, description: 'The display name of the category.' }),
        slug: t.string({ required: true, description: 'The URL-friendly identifier, unique within the category\'s scope.' }),
        description: t.string({ description: 'An optional long-form description of the category.' }),
        parentId: t.int({ description: 'The id of the parent category in the tree; omit to create the category at the root.' }),
        position: t.int({ description: 'The ordering position among sibling categories.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Creates an organization-owned category, gated on `product:create` in the given organization.',
      errors: { types: [CategoryNotFound, CategorySlugTaken], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.createCategory({
              organizationId: Number(input.organizationId.id),
              name: input.name,
              slug: input.slug,
              description: input.description ?? undefined,
              parentId: input.parentId ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { category }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The newly created organization-owned category.' }) }) },
  )

  // ── updateCategory ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateCategory',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Category', required: true, description: 'References the Category node to update.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-lock checking; a stale value is rejected.' }),
        name: t.string({ description: 'A new display name for the category.' }),
        slug: t.string({ description: 'A new URL-friendly identifier, unique within the category\'s scope.' }),
        description: t.string({ description: 'A new long-form description for the category.' }),
        position: t.int({ description: 'A new ordering position among sibling categories.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Updates an existing category\'s editable fields, guarded by optimistic locking.',
      errors: { types: [CategoryNotFound, CategorySlugTaken, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCategoryOrganizationId(ctx, Number(args.input.id.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.updateCategory({
              id: Number(input.id.id),
              version: input.version,
              name: input.name ?? undefined,
              slug: input.slug ?? undefined,
              description: input.description ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { category }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The updated category.' }) }) },
  )

  // ── deleteCategory (soft delete) ───────────────────────────────────────────
  builder.relayMutationField(
    'deleteCategory',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Category', required: true, description: 'References the Category node to delete.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-lock checking; a stale value is rejected.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Soft-deletes a category, marking it as removed while preserving the record.',
      errors: { types: [CategoryNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCategoryOrganizationId(ctx, Number(args.input.id.id)), ['delete']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.softDeleteCategory(Number(input.id.id), input.version)
          }),
        )
        return { category }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The soft-deleted category.' }) }) },
  )

  // ── setParent ──────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setCategoryParent',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Category', required: true, description: 'References the Category node to re-parent.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-lock checking; a stale value is rejected.' }),
        parentId: t.int({ description: 'The id of the new parent category; pass null to detach the category to the root.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Moves a category to a new parent in the tree, or detaches it to the root; a move that would form a cycle is rejected.',
      errors: { types: [CategoryNotFound, CategoryCycle, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCategoryOrganizationId(ctx, Number(args.input.id.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.setParent({
              id: Number(input.id.id),
              version: input.version,
              parentId: input.parentId ?? null,
            })
          }),
        )
        return { category }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The re-parented category.' }) }) },
  )

  // ── placeProduct — base placement (org null) = global; else org graft ──────
  builder.relayMutationField(
    'placeProduct',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        categoryId: t.globalID({ for: 'Category', required: true, description: 'References the Category node the product is placed into.' }),
        productId: t.int({ required: true, description: 'The id of the product to place into the category.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node; when null the placement is a global base placement, otherwise it is an org-specific graft.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Places a product into a category, either as a global base placement or as an organization-specific graft.',
      errors: { types: [CategoryNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['update'] } }
          : { permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const placement = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.placeProduct({
              categoryId: Number(input.categoryId.id),
              productId: input.productId,
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
            })
          }),
        )
        return { placement }
      },
    },
    {
      ...sg('org', 'admin').payload,
      outputFields: t => ({
        productId: t.int({ resolve: p => p.placement.productId, description: 'The id of the product that was placed.' }),
        categoryId: t.int({ resolve: p => p.placement.categoryId, description: 'The id of the category the product was placed into.' }),
      }),
    },
  )

  // ── removePlacement — base placement (org null) = global; else org graft ───
  builder.relayMutationField(
    'removePlacement',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        categoryId: t.globalID({ for: 'Category', required: true, description: 'References the Category node the product is removed from.' }),
        productId: t.int({ required: true, description: 'The id of the product whose placement is removed.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node; when null the global base placement is removed, otherwise the org-specific graft is removed.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Removes a product\'s placement from a category, either the global base placement or an organization-specific graft.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['update'] } }
          : { permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            yield* svc.removePlacement({
              categoryId: Number(input.categoryId.id),
              productId: input.productId,
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
            })
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'Whether the placement was removed.' }) }) },
  )
}
