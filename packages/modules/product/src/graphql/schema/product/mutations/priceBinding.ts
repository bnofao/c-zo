// Price-set binding mutations (Task 20b).
//
// A price binding is always an org graft (organizationId is NOT NULL): it binds
// one of the acting org's price sets to a variant. Authz therefore always gates
// on the input org's `product:update` perm. The service enforces adoption (for a
// global product) and cross-org ownership of the price set.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  CrossOrgGraftDenied,
  PriceBindingService,
  ProductNotAdopted,
  VariantNotFound,
} from '../../../../services'
import { sg } from '../subgraphs'

export function registerPriceBindingMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── bindPriceSet ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'bindPriceSet',
    {
      ...sg('org').input,
      inputFields: t => ({
        variantId: t.globalID({
          for: 'ProductVariant',
          required: true,
          description: 'Global ID of the ProductVariant to bind the price set to.',
        }),
        organizationId: t.globalID({
          for: 'Organization',
          required: true,
          description:
            'Global ID of the Organization that owns this binding. The binding is unique per organization and variant, and grafting onto a global product requires a live adoption in this organization.',
        }),
        priceSetId: t.int({
          required: true,
          description:
            'Raw identifier of the PriceSet in @czo/price to bind. This is a cross-module reference with no foreign key.',
        }),
      }),
    },
    {
      ...sg('org').field,
      description:
        'Binds a @czo/price PriceSet to a variant within a single organization. Requires the product:update permission in that organization, and grafting onto a global product fails with ProductNotAdopted unless a live adoption exists.',
      errors: { types: [VariantNotFound, ProductNotAdopted, CrossOrgGraftDenied], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const binding = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceBindingService
            return yield* svc.bindPriceSet({
              variantId: Number(input.variantId.id),
              organizationId: Number(input.organizationId.id),
              priceSetId: input.priceSetId,
            })
          }),
        )
        return { variantId: binding.variantId, priceSetId: binding.priceSetId }
      },
    },
    {
      ...sg('org').payload,
      outputFields: t => ({
        variantId: t.int({
          resolve: p => p.variantId,
          description: 'Identifier of the variant the price set was bound to.',
        }),
        priceSetId: t.int({
          resolve: p => p.priceSetId,
          description: 'Identifier of the PriceSet that was bound.',
        }),
      }),
    },
  )

  // ── unbindPriceSet ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'unbindPriceSet',
    {
      ...sg('org').input,
      inputFields: t => ({
        variantId: t.globalID({
          for: 'ProductVariant',
          required: true,
          description: 'Global ID of the ProductVariant whose price-set binding should be removed.',
        }),
        organizationId: t.globalID({
          for: 'Organization',
          required: true,
          description:
            'Global ID of the Organization that owns the binding to remove. Bindings are unique per organization and variant.',
        }),
      }),
    },
    {
      ...sg('org').field,
      description:
        'Removes the @czo/price PriceSet binding from a variant within a single organization. Requires the product:update permission in that organization.',
      errors: { types: [], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* PriceBindingService
            yield* svc.unbindPriceSet({
              variantId: Number(input.variantId.id),
              organizationId: Number(input.organizationId.id),
            })
          }),
        )
        return { success: true }
      },
    },
    {
      ...sg('org').payload,
      outputFields: t => ({
        success: t.boolean({
          resolve: p => p.success,
          description: 'True when the binding was removed.',
        }),
      }),
    },
  )
}
