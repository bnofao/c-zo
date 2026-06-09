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
import { loadProductOrganizationId } from '../authz'

export function registerProductMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createProduct ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createProduct',
    {
      inputFields: t => ({
        organizationId: t.globalID({
          for: 'Organization',
          required: false,
          description:
            'The Organization that will own the product; a null value creates a GLOBAL (base) product gated on the global `product` role.',
        }),
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
      description:
        'Creates a product. A null organizationId creates a GLOBAL product gated on the global `product` create permission; otherwise it gates on `product:create` in the given organization.',
      errors: { types: [ProductNotFound, HandleTaken, GlobalProductRequiresGlobalType, ProductTypeNotFound] },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['create'] } }
          : { permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const product = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ProductService
            return yield* svc.createProduct({
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
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
      outputFields: t => ({
        product: t.field({
          type: 'Product',
          resolve: p => p.product,
          description: 'The newly created product.',
        }),
      }),
    },
  )

  // ── updateProduct ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateProduct',
    {
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
      description:
        'Updates a product. Authorization gates on the global `product` update permission for a GLOBAL product (organizationId null) or on `product:update` in the owning organization.',
      errors: { types: [ProductNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
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
      description:
        'Soft-deletes a product by setting its deletedAt timestamp. Authorization gates on the global `product` delete permission for a GLOBAL product (organizationId null) or on `product:delete` in the owning organization.',
      errors: { types: [ProductNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['delete'] } }
        return { permission: { resource: 'product', actions: ['delete'], organization } }
      },
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
