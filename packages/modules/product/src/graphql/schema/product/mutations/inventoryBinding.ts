// Inventory-item link mutations (Task 20b).
//
// An inventory link is always an org graft (organizationId is NOT NULL): it
// links one of the acting org's inventory items to a variant. Authz therefore
// always gates on the input org's `product:update` perm. The service enforces
// adoption, cross-org ownership of the item, and a positive requiredQuantity.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  CrossOrgGraftDenied,
  InvalidRequiredQuantity,
  InventoryBindingService,
  ProductNotAdopted,
  VariantNotFound,
} from '../../../../services'

export function registerInventoryBindingMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── linkInventoryItem ──────────────────────────────────────────────────────
  builder.relayMutationField(
    'linkInventoryItem',
    {
      inputFields: t => ({
        variantId: t.globalID({ for: 'ProductVariant', required: true, description: 'Global ID of the ProductVariant that will consume the linked inventory item.' }),
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization owning this graft; the link is always org-scoped and authorization gates on this org.' }),
        inventoryItemId: t.int({ required: true, description: 'Raw identifier of the InventoryItem in @czo/inventory to link; a cross-module reference owned by this organization.' }),
        requiredQuantity: t.int({ description: 'Number of units of the inventory item one variant consumes. Optional; the service applies a default when omitted, and rejects invalid values.' }),
      }),
    },
    {
      description: 'Links an @czo/inventory InventoryItem to a product variant within a single organization. Requires the `product:update` permission in that organization, and a live adoption when grafting onto a global product.',
      errors: { types: [VariantNotFound, ProductNotAdopted, CrossOrgGraftDenied, InvalidRequiredQuantity] },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const link = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryBindingService
            return yield* svc.linkInventoryItem({
              variantId: Number(input.variantId.id),
              organizationId: Number(input.organizationId.id),
              inventoryItemId: input.inventoryItemId,
              requiredQuantity: input.requiredQuantity ?? undefined,
            })
          }),
        )
        return { variantId: link.variantId, inventoryItemId: link.inventoryItemId, requiredQuantity: link.requiredQuantity }
      },
    },
    {
      outputFields: t => ({
        variantId: t.int({ resolve: p => p.variantId, description: 'Identifier of the variant the inventory item was linked to.' }),
        inventoryItemId: t.int({ resolve: p => p.inventoryItemId, description: 'Identifier of the linked InventoryItem in @czo/inventory.' }),
        requiredQuantity: t.int({ resolve: p => p.requiredQuantity, description: 'Number of units of the inventory item one variant consumes, as resolved by the service.' }),
      }),
    },
  )

  // ── unlinkInventoryItem ────────────────────────────────────────────────────
  builder.relayMutationField(
    'unlinkInventoryItem',
    {
      inputFields: t => ({
        variantId: t.globalID({ for: 'ProductVariant', required: true, description: 'Global ID of the ProductVariant whose inventory item link is being removed.' }),
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization owning this graft; the unlink is always org-scoped and authorization gates on this org.' }),
        inventoryItemId: t.int({ required: true, description: 'Raw identifier of the InventoryItem in @czo/inventory to unlink from the variant.' }),
      }),
    },
    {
      description: 'Removes the link between an @czo/inventory InventoryItem and a product variant within a single organization. Requires the `product:update` permission in that organization.',
      errors: { types: [] },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* InventoryBindingService
            yield* svc.unlinkInventoryItem({
              variantId: Number(input.variantId.id),
              organizationId: Number(input.organizationId.id),
              inventoryItemId: input.inventoryItemId,
            })
          }),
        )
        return { success: true }
      },
    },
    { outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the inventory item link was removed.' }) }) },
  )
}
