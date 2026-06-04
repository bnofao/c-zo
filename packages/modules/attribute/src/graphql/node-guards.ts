// Attribute module — per-type `node(id:)` authorization guards.
//
// `Attribute` and the value objects are relay `drizzleNode`s, so they're
// reachable via the global `node(id:)`/`nodes(ids:)` field. Without a guard, any
// authenticated caller could read an org-private row by global id. These guards
// close that path — and ONLY that path: kit runs them in the relay node
// resolver, never on the per-type connections (`values`/`swatchValues`/
// `referenceValues`, already gated by `choiceAuthScope`) nor on mutation
// returns. So a platform value shown inside an org member's connection is NOT
// subject to the global-read requirement the node guard imposes.
//
// One guard for every attribute-domain node: derive the row's own org and gate
// via `nodeReadScope` (platform row → global `attribute:read`; org-owned row →
// `attribute:read` in that org) — i.e. the SAME scope as the query path, so
// node() is never a weaker read path. `select: true` on each node guarantees
// `organizationId` is loaded for the guard regardless of the client's selection.
// A denied node resolves to null (existence is not leaked).

import type { NodeGuard } from '@czo/kit/graphql'
import { nodeReadScope } from './schema/types'

const orgReadGuard: NodeGuard = (row, _ctx) => nodeReadScope(row)

export const attributeNodeGuards: Record<string, NodeGuard> = {
  Attribute: orgReadGuard,
  AttributeValue: orgReadGuard,
  AttributeSwatchValue: orgReadGuard,
  AttributeReferenceValue: orgReadGuard,
  AttributeTextValue: orgReadGuard,
  AttributeNumericValue: orgReadGuard,
  AttributeBooleanValue: orgReadGuard,
  AttributeDateValue: orgReadGuard,
  AttributeFileValue: orgReadGuard,
}
