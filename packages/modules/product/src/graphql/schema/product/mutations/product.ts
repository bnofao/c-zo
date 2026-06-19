// Product mutations (Task 20a).
//
// Dual authz (switch-on-null): a GLOBAL product (organizationId null) gates on
// the user's global `product` perm; an org-owned one gates on that org.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  GlobalProductRequiresGlobalType,
  HandleTaken,
  ProductNotFound,
  ProductService,
  ProductTypeNotFound,
} from '../../../../services'
import { loadProductOrganizationId, ownerScope } from '../authz'
import { sg } from '../subgraphs'

export function registerProductMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createProduct — PLATFORM (global base product) ───────────────────────────
  // Tier split (mirrors @czo/attribute createAttribute/createOrganizationAttribute):
  // the unqualified mutation creates a GLOBAL product (no org input, global role);
  // `createOrganizationProduct` creates an org-owned one.
  builder.relayMutationField(
    'createProduct',
    {
      ...sg('admin').input,
      inputFields: t => ({
        productTypeId: t.int({
          required: true,
          description:
            'The product type to assign; a global product requires a global product type.',
        }),
        handle: t.string({
          required: true,
          description: 'The URL handle, which must be unique within the product\'s scope.',
        }),
        name: t.string({ required: true, description: 'The display name of the product.' }),
        description: t.string({ description: 'An optional long-form description of the product.' }),
        thumbnailUrl: t.string({ description: 'An optional URL for the product\'s thumbnail image.' }),
      }),
    },
    {
      ...sg('admin').field,
      description:
        'Creates a GLOBAL (base) product, gated on the global `product` create permission. A global product requires a global product type.',
      errors: { types: [ProductNotFound, HandleTaken, GlobalProductRequiresGlobalType, ProductTypeNotFound], ...sg('admin').errorOpts },
      authScopes: () => ({ permission: { resource: 'product', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const product = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.createProduct({
              organizationId: null,
              productTypeId: input.productTypeId,
              handle: input.handle,
              name: input.name,
              description: input.description ?? undefined,
              thumbnailUrl: input.thumbnailUrl ?? undefined,
            })
          }),
        )
        return { product }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        product: t.field({
          type: 'Product',
          resolve: p => p.product,
          description: 'The newly created global product.',
        }),
      }),
    },
  )

  // ── createOrganizationProduct — ORG-owned product ────────────────────────────
  builder.relayMutationField(
    'createOrganizationProduct',
    {
      ...sg('org').input,
      inputFields: t => ({
        organizationId: t.globalID({
          for: 'Organization',
          required: true,
          description: 'The Organization that will own the product; gated on `product:create` in that organization.',
        }),
        productTypeId: t.int({
          required: true,
          description: 'The product type to assign (the org\'s own or a global type).',
        }),
        handle: t.string({
          required: true,
          description: 'The URL handle, which must be unique within the product\'s scope.',
        }),
        name: t.string({ required: true, description: 'The display name of the product.' }),
        description: t.string({ description: 'An optional long-form description of the product.' }),
        thumbnailUrl: t.string({ description: 'An optional URL for the product\'s thumbnail image.' }),
      }),
    },
    {
      ...sg('org').field,
      description:
        'Creates an organization-owned product, gated on `product:create` in the given organization.',
      errors: { types: [ProductNotFound, HandleTaken, ProductTypeNotFound], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({ permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const product = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.createProduct({
              organizationId: Number(input.organizationId.id),
              productTypeId: input.productTypeId,
              handle: input.handle,
              name: input.name,
              description: input.description ?? undefined,
              thumbnailUrl: input.thumbnailUrl ?? undefined,
            })
          }),
        )
        return { product }
      },
    },
    {
      ...sg('org').payload,
      outputFields: t => ({
        product: t.field({
          type: 'Product',
          resolve: p => p.product,
          description: 'The newly created organization-owned product.',
        }),
      }),
    },
  )

  // ── updateProduct ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateProduct',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({
          for: 'Product',
          required: true,
          description: 'The Product to update.',
        }),
        version: t.int({
          required: true,
          description:
            'The optimistic-lock version, which must match the current row or the update is rejected.',
        }),
        name: t.string({ description: 'The new display name; omit to leave it unchanged.' }),
        description: t.string({ description: 'The new long-form description; omit to leave it unchanged.' }),
        thumbnailUrl: t.string({ description: 'The new thumbnail image URL; omit to leave it unchanged.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description:
        'Updates a product. Authorization gates on the global `product` update permission for a GLOBAL product (organizationId null) or on `product:update` in the owning organization.',
      errors: { types: [ProductNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductOrganizationId(ctx, Number(args.input.id.id)), ['update']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const product = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.updateProduct({
              id: Number(input.id.id),
              version: input.version,
              name: input.name ?? undefined,
              description: input.description ?? undefined,
              thumbnailUrl: input.thumbnailUrl ?? undefined,
            })
          }),
        )
        return { product }
      },
    },
    {
      ...sg('org', 'admin').payload,
      outputFields: t => ({
        product: t.field({
          type: 'Product',
          resolve: p => p.product,
          description: 'The updated product.',
        }),
      }),
    },
  )

  // ── deleteProduct (soft delete) ────────────────────────────────────────────
  builder.relayMutationField(
    'deleteProduct',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({
          for: 'Product',
          required: true,
          description: 'The Product to soft-delete.',
        }),
        version: t.int({
          required: true,
          description:
            'The optimistic-lock version, which must match the current row or the delete is rejected.',
        }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description:
        'Soft-deletes a product by setting its deletedAt timestamp. Authorization gates on the global `product` delete permission for a GLOBAL product (organizationId null) or on `product:delete` in the owning organization.',
      errors: { types: [ProductNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => ownerScope(await loadProductOrganizationId(ctx, Number(args.input.id.id)), ['delete']),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const product = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.softDeleteProduct(Number(input.id.id), input.version)
          }),
        )
        return { product }
      },
    },
    {
      ...sg('org', 'admin').payload,
      outputFields: t => ({
        product: t.field({
          type: 'Product',
          resolve: p => p.product,
          description: 'The soft-deleted product, with its deletedAt timestamp set.',
        }),
      }),
    },
  )
}
