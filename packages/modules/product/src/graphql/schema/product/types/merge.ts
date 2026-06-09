// Shared helpers for the product type registrars.
//
// ## Viewer organization
//
// The product overlay model lets an org "graft" its own rows (attributeValues,
// media, price/inventory bindings, channel listings, …) onto a *global* base
// product. A graft connection must therefore return the union of:
//   - the base rows  (`organizationId IS NULL`), plus
//   - the viewer org's own grafts (`organizationId = <viewerOrg>`).
//
// `AuthContext` (from `@czo/auth/graphql`) carries only `{ session, user }` —
// there is **no** active-organization slice. So, mirroring the channel module's
// established convention (its queries take an explicit `organizationId` arg), the
// viewer org is supplied as an explicit optional `viewerOrg` argument on each
// graft field (declared inline via `t.arg.globalID({ for: 'Organization' })`).
// When omitted, only base rows are returned (and `isAdopted` is false): a
// global/anonymous view.

/** Decode the optional `viewerOrg` relay global id arg into a numeric org id. */
export function viewerOrgId(args: { viewerOrg?: { id: string } | null }): number | null {
  return args.viewerOrg ? Number(args.viewerOrg.id) : null
}

/**
 * Auth gate for graft fields (C1 — cross-org confidentiality).
 *
 * Graft connections/fields apply the merge predicate `org IS NULL OR org =
 * viewerOrg`. Without a gate, ANY caller (even unauthenticated) could pass
 * `viewerOrg = <victim org>` and read that org's private grafts via the PUBLIC
 * `productByHandle` query or the relay `node(id:)` path.
 *
 * The gate mirrors the repo's parent-aware authz convention:
 *   - `viewerOrg` omitted (`org == null`) → return `true`: the read is PUBLIC.
 *     The merge predicate surfaces only base (`organizationId IS NULL`) rows, so
 *     the storefront base read stays open.
 *   - `viewerOrg` supplied → require `product:read` in THAT org. An anonymous
 *     caller, or an org-B member passing `viewerOrg=A`, is denied; an org-A
 *     member reading `viewerOrg=A` is granted.
 *
 * Pothos scope-auth: a boolean `true` grants unconditionally; a scope-map
 * requires that scope be satisfied.
 */
export function graftAuthScopes(
  args: { viewerOrg?: { id: string } | null },
): true | { permission: { resource: string, actions: string[], organization: number } } {
  const org = viewerOrgId(args)
  return org == null
    ? true
    : { permission: { resource: 'product', actions: ['read'], organization: org } }
}

/**
 * The merge predicate: base rows (`organizationId IS NULL`) plus, when a viewer
 * org is supplied, that org's own grafts (`organizationId = viewerOrg`).
 *
 * Returned as an RQBv2 `where` fragment to be spread into a connection query.
 * `OrgFilter` is the union of the two graft-row predicates, which the drizzle
 * relational filter type accepts on an `organizationId` column.
 */
type OrgFilter = { organizationId: { isNull: true } } | { organizationId: number }

export function mergeWhere(orgId: number | null): { OR: OrgFilter[] } {
  return orgId == null
    ? { OR: [{ organizationId: { isNull: true } }] }
    : { OR: [{ organizationId: { isNull: true } }, { organizationId: orgId }] }
}
