// Variant mutations (Task 20a).
//
// A variant inherits its parent product's org. Authz therefore gates on the
// product's org for create (resolved from the parent product) and on the
// variant's own org for update/delete. A global product's variant (org null)
// gates on the user's global `product` perm.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  DuplicateVariantMatrix,
  SkuTaken,
  VariantNotFound,
  VariantService,
} from '../../../../services'
import { loadProductOrganizationId, loadVariantOrganizationId } from '../authz'
import { sg } from '../subgraphs'

export function registerVariantMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── createVariant — gates on the PARENT PRODUCT's org ──────────────────────
  builder.relayMutationField(
    'createVariant',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        productId: t.globalID({ for: 'Product', required: true, description: 'Global ID of the parent Product node the new variant belongs to.' }),
        sku: t.string({ description: 'Optional stock-keeping unit. Must be unique when provided.' }),
        position: t.int({ description: 'Optional sort position ordering the variant among its siblings.' }),
        selection: t.field({ type: ['VariantSelectionPairInput'], description: 'Option selection (attribute/value pairs) identifying the variant. Only validated for uniqueness among siblings here; it is persisted separately via assignVariantValue.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Creates a variant under a product. Validates that the option selection is unique among sibling variants; the selection itself is persisted separately via assignVariantValue. Authorization is inherited from the parent product\'s scope (global or org).',
      errors: { types: [VariantNotFound, SkuTaken, DuplicateVariantMatrix], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadProductOrganizationId(ctx, Number(args.input.productId.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['create'] } }
        return { permission: { resource: 'product', actions: ['create'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const variant = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* VariantService
            return yield* svc.createVariant({
              productId: Number(input.productId.id),
              sku: input.sku ?? undefined,
              position: input.position ?? undefined,
              selection: input.selection ?? undefined,
            })
          }),
        )
        return { variant }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ variant: t.field({ type: 'ProductVariant', resolve: p => p.variant, description: 'The newly created variant.' }) }) },
  )

  // ── updateVariant — gates on the VARIANT's org ─────────────────────────────
  builder.relayMutationField(
    'updateVariant',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductVariant', required: true, description: 'Global ID of the ProductVariant node to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic locking; a mismatch raises OptimisticLockError.' }),
        sku: t.string({ description: 'New stock-keeping unit. Must be unique when provided.' }),
        position: t.int({ description: 'New sort position ordering the variant among its siblings.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Updates a variant\'s sku and position. Uses optimistic locking via the version field. Authorization is inherited from the variant\'s scope (global or org).',
      errors: { types: [VariantNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadVariantOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const variant = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* VariantService
            return yield* svc.updateVariant({
              id: Number(input.id.id),
              version: input.version,
              sku: input.sku ?? undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { variant }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ variant: t.field({ type: 'ProductVariant', resolve: p => p.variant, description: 'The updated variant.' }) }) },
  )

  // ── deleteVariant (soft delete) — gates on the VARIANT's org ───────────────
  builder.relayMutationField(
    'deleteVariant',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductVariant', required: true, description: 'Global ID of the ProductVariant node to soft-delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic locking; a mismatch raises OptimisticLockError.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Soft-deletes a variant by setting its deletedAt timestamp. Uses optimistic locking via the version field. Authorization is inherited from the variant\'s scope (global or org).',
      errors: { types: [VariantNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadVariantOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['delete'] } }
        return { permission: { resource: 'product', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const variant = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* VariantService
            return yield* svc.softDeleteVariant(Number(input.id.id), input.version)
          }),
        )
        return { variant }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ variant: t.field({ type: 'ProductVariant', resolve: p => p.variant, description: 'The soft-deleted variant.' }) }) },
  )
}
