// Stock-location module — per-type `node(id:)` authorization guard.
//
// `StockLocation` is a relay `drizzleNode`, so it's reachable via the global
// `node(id:)`/`nodes(ids:)` field. Without a guard, any authenticated caller
// could read another org's stock location by global id (cross-org leak). This
// guard closes that path — and ONLY that path: kit runs it in the relay node
// resolver, never on the `stockLocations` connection (already gated by its own
// `permission` authScope) nor on mutation returns.
//
// It derives the row's owning org and gates via auth's `permission` scope —
// i.e. the SAME scope as `stockLocation(id:)`, so `node()` is never a weaker
// read path than the by-id query. `select: true` on the node (types.ts)
// guarantees `organizationId` is loaded for the guard regardless of the
// client's field selection. A denied node resolves to null (existence is not
// leaked).

import type { NodeGuard } from '@czo/kit/graphql'

export const stockLocationNodeGuards: Record<string, NodeGuard> = {
  StockLocation: (row: { organizationId: number }) => ({
    permission: {
      resource: 'stock-location',
      actions: ['read'],
      organization: row.organizationId,
    },
  }),
}
