// Stock-location module — per-type `node(id:)` authorization guards.
//
// `StockLocation` and `StockLocationAddress` are relay `drizzleNode`s, so
// they're reachable via the global `node(id:)`/`nodes(ids:)` field. Without a
// guard, any authenticated caller could read another org's row by global id
// (cross-org leak). These guards close that path — and ONLY that path: kit runs
// them in the relay node resolver, never on the `stockLocations` connection
// (already gated by its own `permission` authScope) nor on mutation returns.
//
// Each derives the row's owning org and gates via auth's `permission` scope —
// i.e. the SAME scope as `stockLocation(id:)`, so `node()` is never a weaker
// read path than the by-id query. `StockLocation` carries `organizationId`
// directly (`select: true` on the node). `StockLocationAddress` has no own org
// column, so it gates on its parent location's org, loaded via the address
// node's `select: { with: { stockLocation: { columns: { organizationId } } } }`
// (types.ts), regardless of the client's field selection. A denied node
// resolves to null (existence is not leaked).

import type { NodeGuard } from '@czo/kit/graphql'

export const stockLocationNodeGuards: Record<string, NodeGuard> = {
  StockLocation: (row: { organizationId: number }) => ({
    permission: {
      resource: 'stock-location',
      actions: ['read'],
      organization: row.organizationId,
    },
  }),
  StockLocationAddress: (row: { stockLocation: { organizationId: number } }) => ({
    permission: {
      resource: 'stock-location',
      actions: ['read'],
      organization: row.stockLocation.organizationId,
    },
  }),
}
