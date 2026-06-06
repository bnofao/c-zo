/**
 * `@czo/channel` module — defines the channel `CzoModule`, wiring the
 * channel feature into the app manifest.
 *
 * The module depends on BOTH `@czo/auth` AND `@czo/stock-location`:
 *  - `onStart` registers the `'channel'` access domain into auth's
 *    `AccessService`;
 *  - `ChannelModuleLive` requires `StockLocationService` (channels link to
 *    stock locations), which is provided at runtime because `@czo/stock-location`
 *    is listed earlier in the app manifest — `buildApp`'s `provideMerge` fold
 *    supplies it to channel's layer automatically;
 *  - authorization is enforced at request time by auth's `permission`
 *    authScope (membership + permission), reached via `ctx.runEffect`.
 *
 * The host manifest must therefore list this module AFTER both `@czo/auth`
 * and `@czo/stock-location`.
 */
import type { Layer } from 'effect'
import { Access } from '@czo/auth/services'
import { channelNodeGuards, registerChannelSchema } from '@czo/channel/graphql'
import { channelRelations } from '@czo/channel/relations'
import * as channelSchema from '@czo/channel/schema'
import { ChannelModuleLive } from '@czo/channel/services'
import { defineModule } from '@czo/kit/module'
import { Effect } from 'effect'

// Access domain for channels. Statements enumerate the permissions a role may
// hold; the hierarchy maps role names to permission bundles.
const CHANNEL_STATEMENTS = {
  channel: ['create', 'read', 'update', 'delete'],
} as const

const CHANNEL_HIERARCHY: Access.HierarchyLevel<typeof CHANNEL_STATEMENTS>[] = [
  { name: 'channel:viewer', permissions: { channel: ['read'] } },
  { name: 'channel:manager', permissions: { channel: ['create', 'update'] } },
  { name: 'channel:admin', permissions: { channel: ['delete'] } },
]

/**
 * Construct the channel `CzoModule`. The Layer exposes `ChannelService` (+
 * its event bus) and requires `DrizzleDb` + `StockLocationService` (provided
 * by `buildApp` via the manifest fold — stock-location precedes channel).
 * `onStart` registers the access domain while auth's registry is still
 * mutable; auth freezes it in its own `onStarted`, which runs after every
 * module's `onStart`.
 */
export default defineModule(() => ({
  name: 'channel',
  version: '0.0.1',
  layer: ChannelModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: channelSchema as unknown as Record<string, unknown>,
    relations: channelRelations,
  },
  graphql: {
    contribution: builder => registerChannelSchema(builder as never),
    // Authorization reuses auth's `permission` scope (registered by the auth
    // module's `authScope`); no channel-specific scope is needed.
    // The `Channel` node guard org-scopes the global `node(id:)` path so
    // it's never a weaker read than `channel(id:)`.
    nodeGuards: channelNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'channel',
      statements: CHANNEL_STATEMENTS,
      hierarchy: CHANNEL_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
