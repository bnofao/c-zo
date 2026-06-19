// Collection mutations (Task 20a).
//
// Collections are org-only, so every mutation always gates on the owning org.
// create gates on the input org; update/delete/add/remove resolve the org from
// the collection row.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  CollectionNotFound,
  CollectionService,
  CollectionSlugTaken,
} from '../../../../services'
import { loadCollectionOrganizationId, ownerScope } from '../authz'
import { sg } from '../subgraphs'

export function registerCollectionMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createCollection ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'createCollection',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization that will own the collection. Collections are org-scoped, so this is always required.' }),
        name: t.string({ required: true, description: 'Human-readable display name for the collection.' }),
        slug: t.string({ required: true, description: 'URL-friendly identifier, unique within the owning organization.' }),
        description: t.string({ description: 'Optional long-form description of the collection.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Creates a new org-scoped product collection in the given organization. Requires the `product:create` permission in that organization.',
      errors: { types: [CollectionSlugTaken], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const collection = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            return yield* svc.createCollection({
              organizationId: Number(input.organizationId.id),
              name: input.name,
              slug: input.slug,
              description: input.description ?? undefined,
            })
          }),
        )
        return { collection }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ collection: t.field({ type: 'Collection', description: 'The newly created collection.', resolve: p => p.collection }) }) },
  )

  // ── updateCollection ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateCollection',
    {
      ...sg('org').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Collection', required: true, description: 'Global ID of the Collection to update.' }),
        version: t.int({ required: true, description: 'Current optimistic-lock version; the update fails if it no longer matches the stored row.' }),
        name: t.string({ description: 'New display name; omit to leave unchanged.' }),
        slug: t.string({ description: 'New slug; must remain unique within the owning organization. Omit to leave unchanged.' }),
        description: t.string({ description: 'New description; omit to leave unchanged.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Updates a collection\'s mutable fields using optimistic locking. Requires the `product:update` permission in the collection\'s organization.',
      errors: { types: [CollectionNotFound, CollectionSlugTaken, OptimisticLockError], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.id.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const collection = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            return yield* svc.updateCollection({
              id: Number(input.id.id),
              version: input.version,
              name: input.name ?? undefined,
              slug: input.slug ?? undefined,
              description: input.description ?? undefined,
            })
          }),
        )
        return { collection }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ collection: t.field({ type: 'Collection', description: 'The updated collection.', resolve: p => p.collection }) }) },
  )

  // ── deleteCollection (soft delete) ─────────────────────────────────────────
  builder.relayMutationField(
    'deleteCollection',
    {
      ...sg('org').input,
      inputFields: t => ({
        id: t.globalID({ for: 'Collection', required: true, description: 'Global ID of the Collection to delete.' }),
        version: t.int({ required: true, description: 'Current optimistic-lock version; the delete fails if it no longer matches the stored row.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Soft-deletes a collection by setting its `deletedAt` timestamp, using optimistic locking. Requires the `product:delete` permission in the collection\'s organization.',
      errors: { types: [CollectionNotFound, OptimisticLockError], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.id.id)), ['delete']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const collection = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            return yield* svc.softDeleteCollection(Number(input.id.id), input.version)
          }),
        )
        return { collection }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ collection: t.field({ type: 'Collection', description: 'The soft-deleted collection.', resolve: p => p.collection }) }) },
  )

  // ── addProduct ─────────────────────────────────────────────────────────────
  builder.relayMutationField(
    'addProductToCollection',
    {
      ...sg('org').input,
      inputFields: t => ({
        collectionId: t.globalID({ for: 'Collection', required: true, description: 'Global ID of the Collection to add the product to.' }),
        productId: t.int({ required: true, description: 'Raw integer ID of the product to add to the collection.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Adds a product to a collection, creating a many-to-many membership. Requires the `product:update` permission in the collection\'s organization.',
      errors: { types: [CollectionNotFound], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const collection = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            yield* svc.addProduct({ collectionId: Number(input.collectionId.id), productId: input.productId })
            return yield* svc.findCollectionById(Number(input.collectionId.id))
          }),
        )
        return { collection }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ collection: t.field({ type: 'Collection', description: 'The collection with the product now included.', resolve: p => p.collection }) }) },
  )

  // ── removeProduct ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'removeProductFromCollection',
    {
      ...sg('org').input,
      inputFields: t => ({
        collectionId: t.globalID({ for: 'Collection', required: true, description: 'Global ID of the Collection to remove the product from.' }),
        productId: t.int({ required: true, description: 'Raw integer ID of the product to remove from the collection.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Removes a product from a collection, deleting the many-to-many membership. Requires the `product:update` permission in the collection\'s organization.',
      errors: { types: [CollectionNotFound], ...sg('org').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadCollectionOrganizationId(ctx, Number(args.input.collectionId.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const collection = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* CollectionService
            yield* svc.removeProduct({ collectionId: Number(input.collectionId.id), productId: input.productId })
            return yield* svc.findCollectionById(Number(input.collectionId.id))
          }),
        )
        return { collection }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ collection: t.field({ type: 'Collection', description: 'The collection with the product now excluded.', resolve: p => p.collection }) }) },
  )
}
