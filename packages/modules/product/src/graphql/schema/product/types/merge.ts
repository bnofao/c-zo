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

/** A product channel listing row, as far as graft-org derivation cares. */
export interface GraftListing { channelId: number, organizationId: number | null, isPublished: boolean, reviewState: string, deletedAt: Date | null }

/** The graft-field args that drive viewer-org derivation and the auth gate. */
export interface GraftArgs { viewerOrg?: { id: string } | null, channel?: number | null }

/** Decode the optional `viewerOrg` relay global id arg into a numeric org id. */
export function viewerOrgId(args: { viewerOrg?: { id: string } | null }): number | null {
  return args.viewerOrg ? Number(args.viewerOrg.id) : null
}

/**
 * Derive the viewer org for a graft read. `channel` (via its live listing) wins
 * over `viewerOrg`. A channel with no live listing → null (base-only): a caller
 * picks a channel, never an org, so they only ever see the org that published
 * there — no C1 bypass.
 */
export function resolveGraftOrg(args: GraftArgs, listings: ReadonlyArray<GraftListing>): number | null {
  if (args.channel != null) {
    const hit = listings.find(l => l.channelId === args.channel && l.isPublished && l.reviewState === 'approved' && l.deletedAt == null)
    return hit?.organizationId ?? null
  }
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
 *
 * The `channel` path is PUBLIC: the org is derived from the channel's live
 * listing (see `resolveGraftOrg`), never supplied by the caller, so there is no
 * org to gate — a storefront read of a public channel must stay open.
 */
export function graftAuthScopes(
  args: GraftArgs,
): true | { permission: { resource: string, actions: string[], organization: number } } {
  if (args.channel != null)
    return true
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

/**
 * Fold the GraphQL `orderBy` clauses (`[{ field, direction }]`) into the single
 * `{ [column]: direction }` object the drizzleConnection cursor parser expects.
 *
 * The relay connection's cursor encoder (`parseOrderBy`) treats an *array*
 * orderBy as an array of raw Drizzle Columns, not `{ column: direction }`
 * objects; passing the `.map()` array crashes with "Typescript name not found
 * for column undefined". Merging into one object hits the parser's object
 * branch, which resolves each key against the table's columns. Falls back to
 * newest-first when no clause is supplied.
 */
export function buildOrderBy(
  clauses: ReadonlyArray<{ field: string, direction: 'asc' | 'desc' }> | null | undefined,
): Record<string, 'asc' | 'desc'> {
  return clauses?.length
    ? Object.fromEntries(clauses.map(o => [o.field, o.direction]))
    : { createdAt: 'desc' }
}
