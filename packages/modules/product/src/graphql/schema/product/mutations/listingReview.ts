// Admin marketplace-moderation mutations.
//
// The marketplace operator (GLOBAL `channel:update`) reviews product listings
// published onto a platform (org-null) channel. Pre-moderation: a listing is
// live only when its org published it AND an admin approved it. Reject/suspend
// carry a reason surfaced to the owning org.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { Effect } from 'effect'
import {
  ChannelListingNotFound,
  ChannelListingService,
  MarketplaceCategoryNotGlobal,
  NotAMarketplaceChannel,
  ProductNotFound,
  ProductTypeNotGlobal,
} from '../../../../services'
import { sg } from '../subgraphs'

export function registerListingReviewMutations(builder: ProductGraphQLSchemaBuilder): void {
  const adminScope = () => ({ permission: { resource: 'channel', actions: ['update'] } })

  // ── approveListing ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'approveListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to approve.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Approves a product\'s marketplace listing, making it live-eligible (live once the org keeps it published). Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel, ProductNotFound, ProductTypeNotGlobal, MarketplaceCategoryNotGlobal], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.approveListing(Number(args.input.listingId.id))
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The approved listing.' }),
      }),
    },
  )

  // ── rejectListing ───────────────────────────────────────────────────────────
  builder.relayMutationField(
    'rejectListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to reject.' }),
        reason: t.string({ required: true, description: 'Why the listing is rejected; surfaced to the owning org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Rejects a product\'s marketplace listing with a reason. Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.rejectListing(Number(args.input.listingId.id), args.input.reason)
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The rejected listing.' }),
      }),
    },
  )

  // ── suspendListing ──────────────────────────────────────────────────────────
  builder.relayMutationField(
    'suspendListing',
    {
      ...sg('admin').input,
      inputFields: t => ({
        listingId: t.globalID({ for: 'ProductChannelListing', required: true, description: 'Global ID of the ProductChannelListing to suspend.' }),
        reason: t.string({ required: true, description: 'Why the listing is suspended; surfaced to the owning org.' }),
      }),
    },
    {
      ...sg('admin').field,
      description: 'Suspends a previously-approved marketplace listing with a reason (takes it off the marketplace). Requires the global `channel:update` role.',
      errors: { types: [ChannelListingNotFound, NotAMarketplaceChannel], ...sg('admin').errorOpts },
      authScopes: adminScope,
      resolve: async (_root, args, ctx) => {
        const listing = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelListingService
            return yield* svc.suspendListing(Number(args.input.listingId.id), args.input.reason)
          }),
        )
        return { listing }
      },
    },
    {
      ...sg('admin').payload,
      outputFields: t => ({
        listing: t.field({ type: 'ProductChannelListing', resolve: p => p.listing, description: 'The suspended listing.' }),
      }),
    },
  )
}
