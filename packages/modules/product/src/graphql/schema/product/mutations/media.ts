// Media mutations (Task 20b).
//
// addMedia is a graft: a base row (organizationId null) gates on the user's
// global `product:update` perm; an org graft gates on that org. update/remove
// and the variant-link mutations resolve the media row's owning org via
// `loadMediaOrganizationId` (null → global). The service enforces adoption for
// an org graft onto a global product.

import type { ProductGraphQLSchemaBuilder } from '@czo/product/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { Effect } from 'effect'
import {
  MediaNotFound,
  MediaService,
  ProductNotAdopted,
} from '../../../../services'
import { loadMediaOrganizationId } from '../authz'
import { productEnumRefs } from '../inputs'
import { sg } from '../subgraphs'

export function registerMediaMutations(builder: ProductGraphQLSchemaBuilder): void {
  const enums = productEnumRefs()
  // ── addMedia — base (org null) = global; else org graft ────────────────────
  builder.relayMutationField(
    'addMedia',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        productId: t.int({ required: true, description: 'Identifies the product the media asset is attached to.' }),
        organizationId: t.globalID({ for: 'Organization', required: false, description: 'References an Organization node. When null, the media is created as a global BASE row; when set, it is created as an organization-scoped GRAFT over the product.' }),
        url: t.string({ required: true, description: 'The URL of the media asset to display.' }),
        alt: t.string({ description: 'Accessibility alt text describing the media asset.' }),
        type: t.field({ type: enums.MediaType, description: 'The kind of media asset, either IMAGE or VIDEO.' }),
        position: t.int({ description: 'Ordering position of the media within the product gallery.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Adds a media asset to a product, either as a global BASE row when organizationId is null or as an organization-scoped GRAFT when it is set.',
      errors: { types: [ProductNotAdopted], ...sg('org', 'admin').errorOpts },
      authScopes: (_parent, args) =>
        args.input.organizationId == null
          ? { permission: { resource: 'product', actions: ['update'] } }
          : { permission: { resource: 'product', actions: ['update'], organization: Number(args.input.organizationId.id) } },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const media = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* MediaService
            return yield* svc.addMedia({
              productId: input.productId,
              organizationId: input.organizationId ? Number(input.organizationId.id) : null,
              url: input.url,
              alt: input.alt ?? undefined,
              type: (input.type ?? undefined) as 'IMAGE' | 'VIDEO' | undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { media }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ media: t.field({ type: 'ProductMedia', resolve: p => p.media, description: 'The newly created product media asset.' }) }) },
  )

  // ── updateMedia — gates on the MEDIA row's org ─────────────────────────────
  builder.relayMutationField(
    'updateMedia',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductMedia', required: true, description: 'References the ProductMedia node to update.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-locking; the update fails if it does not match.' }),
        url: t.string({ description: 'A new URL for the media asset; left unchanged when omitted.' }),
        alt: t.string({ description: 'New accessibility alt text for the media asset; left unchanged when omitted.' }),
        type: t.field({ type: enums.MediaType, description: 'A new media kind, either IMAGE or VIDEO; left unchanged when omitted.' }),
        position: t.int({ description: 'A new ordering position within the product gallery; left unchanged when omitted.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Updates an existing media asset, authorized against the owning organization of the media row.',
      errors: { types: [MediaNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadMediaOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const media = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* MediaService
            return yield* svc.updateMedia({
              id: Number(input.id.id),
              version: input.version,
              url: input.url ?? undefined,
              alt: input.alt ?? undefined,
              type: (input.type ?? undefined) as 'IMAGE' | 'VIDEO' | undefined,
              position: input.position ?? undefined,
            })
          }),
        )
        return { media }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ media: t.field({ type: 'ProductMedia', resolve: p => p.media, description: 'The updated product media asset.' }) }) },
  )

  // ── removeMedia (soft delete) — gates on the MEDIA row's org ───────────────
  builder.relayMutationField(
    'removeMedia',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        id: t.globalID({ for: 'ProductMedia', required: true, description: 'References the ProductMedia node to remove.' }),
        version: t.int({ required: true, description: 'The expected current version for optimistic-locking; the removal fails if it does not match.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Soft-deletes an existing media asset, authorized against the owning organization of the media row.',
      errors: { types: [MediaNotFound, OptimisticLockError], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadMediaOrganizationId(ctx, Number(args.input.id.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const media = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* MediaService
            return yield* svc.removeMedia(Number(input.id.id), input.version)
          }),
        )
        return { media }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ media: t.field({ type: 'ProductMedia', resolve: p => p.media, description: 'The soft-deleted product media asset.' }) }) },
  )

  // ── linkVariantMedia — gates on the MEDIA row's org ────────────────────────
  builder.relayMutationField(
    'linkVariantMedia',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        variantId: t.globalID({ for: 'ProductVariant', required: true, description: 'References the ProductVariant node to attach the media asset to.' }),
        mediaId: t.globalID({ for: 'ProductMedia', required: true, description: 'References the ProductMedia node to attach to the variant.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Attaches a media asset to a specific product variant via the global link table, authorized against the owning organization of the media row.',
      errors: { types: [MediaNotFound], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadMediaOrganizationId(ctx, Number(args.input.mediaId.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* MediaService
            yield* svc.linkVariantMedia({
              variantId: Number(input.variantId.id),
              mediaId: Number(input.mediaId.id),
            })
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the media asset was successfully linked to the variant.' }) }) },
  )

  // ── unlinkVariantMedia — gates on the MEDIA row's org ──────────────────────
  builder.relayMutationField(
    'unlinkVariantMedia',
    {
      ...sg('org', 'admin').input,
      inputFields: t => ({
        variantId: t.globalID({ for: 'ProductVariant', required: true, description: 'References the ProductVariant node to detach the media asset from.' }),
        mediaId: t.globalID({ for: 'ProductMedia', required: true, description: 'References the ProductMedia node to detach from the variant.' }),
      }),
    },
    {
      ...sg('org', 'admin').field,
      description: 'Detaches a media asset from a specific product variant via the global link table, authorized against the owning organization of the media row.',
      errors: { types: [], ...sg('org', 'admin').errorOpts },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadMediaOrganizationId(ctx, Number(args.input.mediaId.id))
        if (organization == null)
          return { permission: { resource: 'product', actions: ['update'] } }
        return { permission: { resource: 'product', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* MediaService
            yield* svc.unlinkVariantMedia({
              variantId: Number(input.variantId.id),
              mediaId: Number(input.mediaId.id),
            })
          }),
        )
        return { success: true }
      },
    },
    { ...sg('org', 'admin').payload, outputFields: t => ({ success: t.boolean({ resolve: p => p.success, description: 'True when the media asset was successfully unlinked from the variant.' }) }) },
  )
}
