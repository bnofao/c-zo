import type { ChannelGraphQLSchemaBuilder } from '@czo/channel/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { ChannelService, generateHandle } from '../../../services/channel'
import { loadOrganizationId } from './authz'
import { ChannelHandleTaken, ChannelNotFound, CrossOrgStockLocation } from './errors'

const handleSchema = z.string().regex(/^[a-z0-9-]+$/, {
  message: 'Handle must be lowercase letters, digits, or hyphens only',
}).max(100)

// ─── Channel Mutations ────────────────────────────────────────────────────────

export function registerChannelMutations(builder: ChannelGraphQLSchemaBuilder): void {
  // ── createChannel ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'createChannel',
    {
      inputFields: t => ({
        organizationId: t.globalID({ for: 'Organization', required: true, description: 'Identifies the owning Organization node under which the new sales channel is created.' }),
        name: t.string({ required: true, validate: z.string().min(1).max(255).transform(v => v.trim()), description: 'Human-readable display name of the sales channel.' }),
        handle: t.string({ validate: handleSchema.optional(), description: 'URL-safe identifier, unique within the organization; derived from the name when omitted.' }),
        description: t.string({ description: 'Optional longer description of the sales channel.' }),
        isDefault: t.boolean({ description: 'Marks this channel as the organization\'s default; defaults to false when omitted.' }),
        isActive: t.boolean({ description: 'Whether the channel is available for selling; defaults to true when omitted.' }),
        metadata: t.field({ type: 'JSONObject', description: 'Freeform key-value metadata attached to the channel.' }),
      }),
    },
    {
      description: 'Creates a new organization-scoped sales channel.',
      errors: { types: [ValidationError, ChannelHandleTaken] },
      authScopes: (_parent, args) => ({
        permission: {
          resource: 'channel',
          actions: ['create'],
          organization: Number(args.input.organizationId.id),
        },
      }),
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const orgId = input.organizationId.id
        const handle = input.handle ?? generateHandle(input.name)

        const channel = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            return yield* svc.create({
              organizationId: Number(orgId),
              name: input.name,
              handle,
              description: input.description ?? undefined,
              isDefault: input.isDefault ?? undefined,
              isActive: input.isActive ?? undefined,
              metadata: input.metadata,
            })
          }),
        )
        return { channel }
      },
    },
    {
      outputFields: t => ({
        channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The newly created sales channel.' }),
      }),
    },
  )

  // ── updateChannel ─────────────────────────────────────────────────────────
  builder.relayMutationField(
    'updateChannel',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Channel', required: true, description: 'Identifies the Channel node to update.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
        name: t.string({ validate: z.string().min(1).max(255).transform(v => v.trim()).optional(), description: 'New display name; left unchanged when omitted.' }),
        handle: t.string({ validate: handleSchema.optional(), description: 'New URL-safe identifier, unique within the organization; left unchanged when omitted.' }),
        description: t.string({ description: 'New description; left unchanged when omitted.' }),
        isActive: t.boolean({ description: 'New availability state; left unchanged when omitted.' }),
        isDefault: t.boolean({ description: 'New default-channel flag; left unchanged when omitted.' }),
        metadata: t.field({ type: 'JSONObject', description: 'New freeform metadata; left unchanged when omitted.' }),
      }),
    },
    {
      description: 'Updates an existing sales channel\'s fields.',
      errors: { types: [ValidationError, ChannelNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'channel', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const channel = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            return yield* svc.update(Number(input.id.id), input.version, {
              name: input.name ?? undefined,
              handle: input.handle ?? undefined,
              description: input.description ?? undefined,
              isActive: input.isActive ?? undefined,
              isDefault: input.isDefault ?? undefined,
              metadata: input.metadata,
            })
          }),
        )
        return { channel }
      },
    },
    {
      outputFields: t => ({
        channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The updated sales channel.' }),
      }),
    },
  )

  // ── deleteChannel (soft delete) ───────────────────────────────────────────
  builder.relayMutationField(
    'deleteChannel',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Channel', required: true, description: 'Identifies the Channel node to soft-delete.' }),
        version: t.int({ required: true, description: 'Expected current version for optimistic-lock concurrency control.' }),
      }),
    },
    {
      description: 'Soft-deletes a sales channel, marking it removed without erasing the row.',
      errors: { types: [ChannelNotFound, OptimisticLockError] },
      authScopes: async (_parent, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.id.id))
        // Unknown id → require auth and defer to the service's NotFound (404),
        // rather than masking existence as a 403 (org-permission needs an org).
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'channel', actions: ['delete'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const input = args.input
        const channel = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            return yield* svc.softDelete(Number(input.id.id), input.version)
          }),
        )
        return { channel }
      },
    },
    {
      outputFields: t => ({
        channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The soft-deleted sales channel.' }),
      }),
    },
  )

  // ── addStockLocationsToChannel ────────────────────────────────────────────
  // Link/unlink return the updated Channel's scalar fields. The channel's
  // `stockLocations` relay connection is read via the `channel(id:)` query (a
  // relay connection resolves on the query/node path where the parent is a
  // drizzle-loaded node; selecting it inside a mutation payload — POJO parent —
  // is unsupported by the Pothos-drizzle relatedConnection batch loader).
  builder.relayMutationField(
    'addStockLocationsToChannel',
    {
      inputFields: t => ({
        channelId: t.globalID({ for: 'Channel', required: true, description: 'Identifies the Channel node to link stock locations to.' }),
        stockLocationIds: t.globalIDList({ for: 'StockLocation', required: true, description: 'StockLocation nodes to associate with the channel as fulfilment sources.' }),
      }),
    },
    {
      description: 'Associates one or more stock locations with a sales channel as fulfilment sources.',
      errors: { types: [ChannelNotFound, CrossOrgStockLocation] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.channelId.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'channel', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const cid = Number(args.input.channelId.id)
        const slIds = args.input.stockLocationIds.map(g => Number(g.id))
        const channel = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            yield* svc.addStockLocations(cid, slIds)
            return yield* svc.findFirst({ where: { id: cid } })
          }),
        )
        return { channel }
      },
    },
    {
      outputFields: t => ({
        channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The channel with its updated stock-location associations.' }),
      }),
    },
  )

  // ── removeStockLocationsFromChannel ───────────────────────────────────────
  builder.relayMutationField(
    'removeStockLocationsFromChannel',
    {
      inputFields: t => ({
        channelId: t.globalID({ for: 'Channel', required: true, description: 'Identifies the Channel node to unlink stock locations from.' }),
        stockLocationIds: t.globalIDList({ for: 'StockLocation', required: true, description: 'StockLocation nodes to disassociate from the channel.' }),
      }),
    },
    {
      description: 'Removes one or more stock-location associations from a sales channel.',
      errors: { types: [ChannelNotFound] },
      authScopes: async (_p, args, ctx) => {
        const organization = await loadOrganizationId(ctx, Number(args.input.channelId.id))
        if (organization == null)
          return { auth: true }
        return { permission: { resource: 'channel', actions: ['update'], organization } }
      },
      resolve: async (_root, args, ctx) => {
        const cid = Number(args.input.channelId.id)
        const slIds = args.input.stockLocationIds.map(g => Number(g.id))
        const channel = await ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* ChannelService
            yield* svc.removeStockLocations(cid, slIds)
            return yield* svc.findFirst({ where: { id: cid } })
          }),
        )
        return { channel }
      },
    },
    {
      outputFields: t => ({
        channel: t.field({ type: 'Channel', resolve: p => p.channel, description: 'The channel with its updated stock-location associations.' }),
      }),
    },
  )
}
