// Channel module — per-type `node(id:)` authorization guard.
//
// `Channel` is a relay `drizzleNode`, so it's reachable via the global
// `node(id:)`/`nodes(ids:)` field. Without a guard, any authenticated caller
// could read another org's channel by global id (cross-org leak). This
// guard closes that path — and ONLY that path: kit runs it in the relay node
// resolver, never on the `channels` connection (already gated by its own
// `permission` authScope) nor on mutation returns.
//
// It derives the row's tier and gates via auth's `permission` scope — i.e. the
// SAME scope as `channel(id:)`, so `node()` is never a weaker read path than the
// by-id query. Tier-aware: a platform row (org `null`) gates on the GLOBAL
// `channel:read` role; an org row gates on `channel:read` in its org.
// `select: true` on the node (types.ts) guarantees `organizationId` is loaded
// for the guard regardless of the client's field selection. A denied node
// resolves to null (existence is not leaked).

import type { NodeGuard } from '@czo/kit/graphql'
import { channelPermission } from './schema/channel/authz'

export const channelNodeGuards: Record<string, NodeGuard> = {
  Channel: (row: { organizationId: number | null }) => channelPermission('read', row.organizationId),
}
