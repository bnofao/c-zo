// Product module — per-type `node(id:)` authorization guards.
//
// The drizzle relay nodes (Product, ProductVariant, ProductType,
// ProductTypeAttribute, Category, Collection, ProductMedia) are reachable via
// the global `node(id:)` / `nodes(ids:)` field. Without a guard, any
// authenticated caller could read another org's row by global id (cross-org
// leak). kit runs these guards in the relay node resolver only — never on
// connections (gated by their own `permission` authScope) nor on mutation
// returns. A denied node resolves to null (existence is not leaked).
//
// Each node carries `organizationId` (`select: true` on its drizzleNode, so the
// column is loaded regardless of the client's field selection):
//   - `null` → a global/platform row → gate via the org-less `permission` scope,
//     i.e. the global `product:read` role — the SAME gate as the global by-id
//     queries and the global list connections, so `node()` is never a weaker
//     read path than the query for global rows.
//   - non-null → an org-owned row → gate via auth's `permission` scope in that
//     org, the SAME scope as the by-id queries.

import type { NodeGuard } from '@czo/kit/graphql'

const productReadGuard: NodeGuard = (row: { organizationId: number | null }) =>
  row.organizationId == null
    ? { permission: { resource: 'product', actions: ['read'] } }
    : { permission: { resource: 'product', actions: ['read'], organization: row.organizationId } }

export const productNodeGuards: Record<string, NodeGuard> = {
  Product: productReadGuard,
  ProductVariant: productReadGuard,
  ProductType: productReadGuard,
  ProductTypeAttribute: productReadGuard,
  Category: productReadGuard,
  Collection: productReadGuard,
  ProductMedia: productReadGuard,
}
