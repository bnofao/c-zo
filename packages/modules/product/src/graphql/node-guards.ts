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
//   - `null` → a global/base row, readable by any authenticated viewer's org
//     (matches the graft merge predicate `base ∪ viewerOrg`) → `{ auth: true }`.
//   - non-null → an org-owned row → gate via auth's `permission` scope, the SAME
//     scope as the by-id queries, so `node()` is never a weaker read path.

import type { NodeGuard } from '@czo/kit/graphql'

const productReadGuard: NodeGuard = (row: { organizationId: number | null }) =>
  row.organizationId == null
    ? { auth: true }
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
