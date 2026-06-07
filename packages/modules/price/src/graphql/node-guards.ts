// Price module — per-type `node(id:)` authorization guard.
//
// `PriceSet`, `Price`, and `PriceList` are relay `drizzleNode`s reachable via
// the global `node(id:)`/`nodes(ids:)` field. Without a guard, any
// authenticated caller could read another org's price data by global id
// (cross-org leak). This guard closes that path — and ONLY that path: kit
// runs it in the relay node resolver, never on connections (already gated by
// their own `permission` authScope) nor on mutation returns.
//
// It derives the row's owning org and gates via auth's `permission` scope —
// i.e. the SAME scope as per-id queries, so `node()` is never a weaker read
// path. `select: true` on the node (types.ts) guarantees `organizationId` is
// loaded for the guard regardless of the client's field selection. A denied
// node resolves to null (existence is not leaked).

import type { NodeGuard } from '@czo/kit/graphql'

const priceReadGuard: NodeGuard = (row: { organizationId: number }) => ({
  permission: { resource: 'price', actions: ['read'], organization: row.organizationId },
})

export const priceNodeGuards: Record<string, NodeGuard> = {
  PriceSet: priceReadGuard,
  Price: priceReadGuard,
  PriceList: priceReadGuard,
}
