// Adoption mutations (Task 20b).
//
// An org adopts a GLOBAL product to graft org-scoped data onto it. Both
// mutations are org-scoped — they gate on the acting org's `product` perm:
// adopt → `create`, unadopt → `delete`. The service enforces that only global
// products can be adopted and cascades graft-cleanup on unadopt.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  AdoptionNotFound,
  AdoptionService,
  CannotAdoptOwnedProduct,
  ProductNotFound,
} from '../../../../services'

export function registerAdoptionMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── adoptProduct ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'adoptProduct',
    {
      inputFields: t => ({
        productId: t.globalID({
          for: 'Product',
          required: true,
          description: 'Global ID of the Product node to adopt; must reference a global product, not an org-owned one.',
        }),
        organization: t.globalID({
          for: 'Organization',
          required: true,
          description: 'Global ID of the Organization node adopting the product.',
        }),
      }),
    },
    {
      description:
        'Adopts a global product into an organization so the org may graft org-scoped data (prices, attributes, inventory, media, channel listings) onto it. Idempotent: re-adopting an already-adopted product is a no-op. Rejects org-owned products with CannotAdoptOwnedProduct.',
      errors: { types: [ProductNotFound, CannotAdoptOwnedProduct] },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['create'], organization: Number(args.input.organization.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const adoption = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AdoptionService
            return yield* svc.adoptProduct({
              productId: Number(input.productId.id),
              orgId: Number(input.organization.id),
            })
          }),
        )
        return { productId: adoption.productId, organizationId: adoption.organizationId }
      },
    },
    {
      outputFields: t => ({
        productId: t.int({ description: 'Database ID of the adopted global product.', resolve: p => p.productId }),
        organizationId: t.int({
          description: 'Database ID of the organization that adopted the product.',
          resolve: p => p.organizationId,
        }),
      }),
    },
  )

  // ── unadoptProduct ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unadoptProduct',
    {
      inputFields: t => ({
        productId: t.globalID({
          for: 'Product',
          required: true,
          description: 'Global ID of the Product node to unadopt.',
        }),
        organization: t.globalID({
          for: 'Organization',
          required: true,
          description: 'Global ID of the Organization node unadopting the product.',
        }),
      }),
    },
    {
      description:
        'Unadopts a global product from an organization: soft-deletes the adoption and purges all of that org\'s grafts (prices, attributes, inventory, media, channel listings) on the product. The base global product data is left intact. Fails with AdoptionNotFound when no adoption exists.',
      errors: { types: [AdoptionNotFound] },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['delete'], organization: Number(args.input.organization.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* AdoptionService
            yield* svc.unadoptProduct({
              productId: Number(input.productId.id),
              orgId: Number(input.organization.id),
            })
          }),
        )
        return { success: true }
      },
    },
    {
      outputFields: t => ({
        success: t.boolean({ description: 'True when the adoption was removed and the org grafts purged.', resolve: p => p.success }),
      }),
    },
  )
}
