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
import { loadCategoryOrganizationId } from '../authz'

export function registerCategoryMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createCategory ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createCategory',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node; when null the category is created at the global base level and requires the global product permission.' }),
        name: t.string({ required: true, description: 'The display name of the category.' }),
        slug: t.string({ required: true, description: 'The URL-friendly identifier, unique within the category\'s scope.' }),
        description: t.string({ description: 'An optional long-form description of the category.' }),
        parentId: t.int({ description: 'The id of the parent category in the tree; omit to create the category at the root.' }),
        position: t.int({ description: 'The ordering position among sibling categories.' }),
      }),
    },
    {
      description: 'Creates a new category, either at the global base level or owned by an organization.',
      errors: { types: [CategoryNotFound, CategorySlugTaken] },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['create'] } }
          : { permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const category = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CategoryService
            return yield* svc.createCategory({
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
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
    { outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The newly created category.' }) }) },
  )

  // ── updateCategory ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateCategory',
    {
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
      description: 'Updates an existing category\'s editable fields, guarded by optimistic locking.',
      errors: { types: [CategoryNotFound, CategorySlugTaken, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadCategoryOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
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
    { outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The updated category.' }) }) },
  )

  // ── deleteCategory (soft delete) ───────────────────────────────────────────
  builder.relayMutationField(
    'deleteCategory',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Category', required: true, description: 'References the Category node to delete.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-lock checking; a stale value is rejected.' }),
      }),
    },
    {
      description: 'Soft-deletes a category, marking it as removed while preserving the record.',
      errors: { types: [CategoryNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadCategoryOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['delete'] } }
        return { permission: { resource: 'product', actions: ['delete'], organization } }
      },
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
    { outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The soft-deleted category.' }) }) },
  )

  // ── setParent ──────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'setCategoryParent',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Category', required: true, description: 'References the Category node to re-parent.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-lock checking; a stale value is rejected.' }),
        parentId: t.int({ description: 'The id of the new parent category; pass null to detach the category to the root.' }),
      }),
    },
    {
      description: 'Moves a category to a new parent in the tree, or detaches it to the root; a move that would form a cycle is rejected.',
      errors: { types: [CategoryNotFound, CategoryCycle, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadCategoryOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
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
    { outputFields: t => ({ category: t.field({ type: 'Category', resolve: p => p.category, description: 'The re-parented category.' }) }) },
  )

  // ── placeProduct — base placement (org null) = global; else org graft ──────
  builder.relayMutationField(
    'placeProduct',
    {
      inputFields: t => ({
        categoryId: t.globalID({ for: 'Category', required: true, description: 'References the Category node the product is placed into.' }),
        productId: t.int({ required: true, description: 'The id of the product to place into the category.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node; when null the placement is a global base placement, otherwise it is an org-specific graft.' }),
      }),
    },
    {
      description: 'Places a product into a category, either as a global base placement or as an organization-specific graft.',
      errors: { types: [CategoryNotFound] },
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
      inputFields: t => ({
        categoryId: t.globalID({ for: 'Category', required: true, description: 'References the Category node the product is removed from.' }),
        productId: t.int({ required: true, description: 'The id of the product whose placement is removed.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node; when null the global base placement is removed, otherwise the org-specific graft is removed.' }),
      }),
    },
    {
      description: 'Removes a product\'s placement from a category, either the global base placement or an organization-specific graft.',
      errors: { types: [] },
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
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'Whether the placement was removed.' }) }) },
  )
}
