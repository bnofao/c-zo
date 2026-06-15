// Channel-publication mutations (Task 20b).
//
// Publishing a product on a channel is an org-scoped action: the channel belongs
// to the acting org. Authz gates on the input org's `product:update` perm. The
// service enforces adoption (for a global product) and cross-org ownership of
// the channel.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  ChannelListingService,
  CrossOrgGraftDenied,
  ProductNotAdopted,
  ProductNotFound,
} from '../../../../services'
import { sg } from '../subgraphs'

/** Coerce a relay DateTime input (string | Date) to a Date, preserving null. */
function toDate(value: Date | string | null | undefined): Date | null | undefined {
  if (value == null)
    return value
  return value instanceof Date ? value : new Date(value)
}

export function registerChannelListingMutations(builder: ProductGraphQLSchemaBuilder): void {
  // ── publishProduct ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'publishProduct',
    {
      ...sg('org').input,
      inputFields: t => ({
        productId: t.globalID({ for: 'Product', required: true, description: 'Global ID of the Product node to publish on the channel.' }),
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization node that owns this listing and that authorization is gated against; grafting a global product requires a live adoption in this org.' }),
        channelId: t.int({ required: true, description: 'Raw cross-module identifier of the @czo/channel sales channel to publish on; must be owned by the acting organization.' }),
        isPublished: t.boolean({ description: 'Whether the listing is live on the channel. Defaults to the service default when omitted.' }),
        visibleInListings: t.boolean({ description: 'Whether the product appears in the channel\'s browse and listing surfaces. Defaults to the service default when omitted.' }),
        availableForPurchaseAt: t.field({ type: 'DateTime', description: 'Timestamp from which the product becomes purchasable on the channel.' }),
        publishedAt: t.field({ type: 'DateTime', description: 'Timestamp at which the listing was or will be published on the channel.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Publishes a product on a @czo/channel sales channel, creating or updating the org-scoped listing that controls its visibility on that channel (no per-channel pricing). Requires the `product:update` permission in the organization, and a live adoption when grafting onto a global product.',
      errors: { types: [ProductNotFound, ProductNotAdopted, CrossOrgGraftDenied], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.publish({
              productId: Number(input.productId.id),
              channelId: input.channelId,
              organizationId: Number(input.organizationId.id),
              isPublished: input.isPublished ?? undefined,
              visibleInListings: input.visibleInListings ?? undefined,
              availableForPurchaseAt: toDate(input.availableForPurchaseAt) ?? undefined,
              publishedAt: toDate(input.publishedAt) ?? undefined,
            })
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('org').payload,
      outputFields: t => ({
        productId: t.int({ description: 'Identifier of the published product.', resolve: p => p.listing.productId }),
        channelId: t.int({ description: 'Identifier of the channel the product was published on.', resolve: p => p.listing.channelId }),
        isPublished: t.boolean({ description: 'Whether the resulting listing is live on the channel.', resolve: p => p.listing.isPublished }),
        visibleInListings: t.boolean({ description: 'Whether the product is shown in the channel\'s browse and listing surfaces.', resolve: p => p.listing.visibleInListings }),
      }),
    },
  )

  // ── unpublishProduct ───────────────────────────────────────────────────────
  builder.relayMutationField(
    'unpublishProduct',
    {
      ...sg('org').input,
      inputFields: t => ({
        productId: t.globalID({ for: 'Product', required: true, description: 'Global ID of the Product node to unpublish from the channel.' }),
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Global ID of the Organization node that authorization is gated against.' }),
        channelId: t.int({ required: true, description: 'Raw cross-module identifier of the @czo/channel sales channel to unpublish from.' }),
      }),
    },
    {
      ...sg('org').field,
      description: 'Removes or disables the org-scoped listing for a product on a @czo/channel sales channel, taking it off that channel. Requires the `product:update` permission in the organization.',
      errors: { types: [ProductNotFound, ProductNotAdopted, CrossOrgGraftDenied], ...sg('org').errorOpts },
      authScopes: (_parent, args) => ({
        permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            yield* svc.unpublish({
              productId: Number(input.productId.id),
              channelId: input.channelId,
              organizationId: Number(input.organizationId.id),
            })
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org').payload, outputFields: t => ({ success: t.boolean({ description: 'True when the product was unpublished from the channel.', resolve: p => p.success }) }) },
  )
}
