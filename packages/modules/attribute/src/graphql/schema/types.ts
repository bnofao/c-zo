// Attribute module — Pothos object types and the per-type choice connections
// on `Attribute`.
//
// Object types:
//   - `Attribute`            → relay node on `attributes`
//   - choice values          → `AttributeValue`, `AttributeSwatchValue`,
//                              `AttributeReferenceValue` (drizzle objects)
//   - typed values           → `AttributeTextValue`, `AttributeNumericValue`,
//                              `AttributeBooleanValue`, `AttributeDateValue`,
//                              `AttributeFileValue` (drizzle objects)
//
// A choice attribute surfaces exactly ONE kind of value, fixed by its `type`
// (DROPDOWN/MULTISELECT → `values`, SWATCH → `swatchValues`, REFERENCE →
// `referenceValues`). Each is its own relay connection: batched by the drizzle
// plugin (no N+1) and org-scoped (platform ∪ requested-org rows) by the `query`
// callback. Ordered by `position`.
//
// The org is the EXPLICIT optional `organizationId` arg (a relay global id) —
// there is no session-derived scoping. Two cases, decided per-parent in the
// connection `authScopes` (which sees the parent attribute row):
//   • global attribute (organizationId = null): arg-driven. Omitting the arg
//     scopes to platform rows (authenticated caller); supplying `O` requires
//     `attribute:read` in `O` (the cross-tenant gate).
//   • org-owned attribute (organizationId = X): the only valid view is X's own
//     rows. The arg MUST name X and the caller needs `attribute:read` in X; any
//     other arg (or none) is denied. So `node(id:)` can no longer surface a
//     private attribute's values to a foreigner.

import type { AttributeGraphQLSchemaBuilder } from '..'
import type { FileInfo } from './scalars'
import { attributeEnumRefs } from './enums'

/** Decode the explicit `organizationId` arg (parsed relay id) to a numeric org, or null. */
function argOrg(organizationId: { id: string } | null | undefined): number | null {
  return organizationId != null ? Number(organizationId.id) : null
}

/** Visibility `where` for a choice table: platform rows, plus the requested org's rows. */
function choiceWhere(args: { organizationId?: { id: string } | null }) {
  const org = argOrg(args.organizationId)
  return org == null
    ? { organizationId: { isNull: true as const } }
    : { OR: [{ organizationId: { isNull: true as const } }, { organizationId: org }] }
}

/**
 * Parent-aware authScope for a choice connection.
 *
 * - Org-owned attribute (`parentOrg = X`): the connection only ever exposes X's
 *   rows, so the arg MUST name X and the caller needs `attribute:read` in X. A
 *   foreign arg (or a missing one) is denied — passing another org on a private
 *   attribute is a meaningless, leak-shaped request, and this is what stops
 *   `node(id:)` from leaking a private attribute's values.
 * - Global attribute (`parentOrg = null`): arg-driven. No arg → platform rows for
 *   any authenticated caller; an arg `O` → `attribute:read` in `O` (cross-tenant
 *   gate). Without that gate the arg would be a cross-org read leak.
 */
function choiceAuthScope(parentOrg: number | null, args: { organizationId?: { id: string } | null }) {
  const arg = argOrg(args.organizationId)
  if (parentOrg != null) {
    return arg === parentOrg
      ? { permission: { resource: 'attribute', actions: ['read'], organization: parentOrg } }
      : false
  }
  return arg == null
    ? { auth: true as const }
    : { permission: { resource: 'attribute', actions: ['read'], organization: arg } }
}

/**
 * The `node(id:)` read scope for any attribute-domain row, derived from its own
 * org. Used by the kit node-guard registry (`graphql/node-guards.ts`) for the
 * Attribute node AND every value node — so the relay `node`/`nodes` path is
 * gated uniformly (a denied node resolves to null). Mirrors the query gate
 * (`tierScope` / `attributePermission('read', org)`) so node() is never a weaker
 * path than `attribute(id)` / `attributes`:
 *   • platform row (organizationId = null) → global `attribute:read` (no org).
 *   • org-owned row (organizationId = X)   → `attribute:read` in X.
 */
export function nodeReadScope(attr: { organizationId: number | null }) {
  return attr.organizationId == null
    ? { permission: { resource: 'attribute', actions: ['read'] } }
    : { permission: { resource: 'attribute', actions: ['read'], organization: attr.organizationId } }
}

export function registerAttributeTypes(builder: AttributeGraphQLSchemaBuilder): void {
  const enums = attributeEnumRefs()

  // ── Choice value objects ───────────────────────────────────────────────────
  builder.drizzleNode('attributeValues', {
    name: 'AttributeValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug'),
      value: t.exposeString('value'),
      position: t.exposeInt('position'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeSwatchValues', {
    name: 'AttributeSwatchValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug'),
      value: t.exposeString('value'),
      color: t.exposeString('color', { nullable: true }),
      position: t.exposeInt('position'),
      // Composed `file` field — present only when a file URL is stored.
      file: t.field({
        type: 'FileInfo',
        nullable: true,
        resolve: (row): FileInfo | null =>
          row.fileUrl != null ? { url: row.fileUrl, mimetype: row.mimetype ?? '' } : null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeReferenceValues', {
    name: 'AttributeReferenceValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug'),
      value: t.exposeString('value'),
      referenceId: t.exposeInt('referenceId'),
      position: t.exposeInt('position'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  // ── Typed value objects ────────────────────────────────────────────────────
  builder.drizzleNode('attributeTextValues', {
    name: 'AttributeTextValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      plain: t.exposeString('plain'),
      rich: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: row => row.rich as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeNumericValues', {
    name: 'AttributeNumericValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.exposeFloat('value'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeBooleanValues', {
    name: 'AttributeBooleanValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.exposeBoolean('value'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeDateValues', {
    name: 'AttributeDateValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.expose('value', { type: 'DateTime' }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  builder.drizzleNode('attributeFileValues', {
    name: 'AttributeFileValue',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      file: t.field({
        type: 'FileInfo',
        resolve: (row): FileInfo => ({ url: row.fileUrl, mimetype: row.mimetype }),
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    }),
  })

  // ── Attribute node ─────────────────────────────────────────────────────────
  // The `node(id:)` gate lives in the kit node-guard registry (see
  // `graphql/node-guards.ts`) alongside the value nodes — one mechanism, one
  // denial shape (resolves to null). `select: true` always loads every column,
  // so `attr.organizationId` is reliably present for both the node guard and the
  // connection `authScopes` regardless of the client's field selection.
  builder.drizzleNode('attributes', {
    name: 'Attribute',
    select: true,
    id: { column: a => a.id },
    fields: t => ({
      name: t.exposeString('name'),
      slug: t.exposeString('slug'),
      type: t.field({ type: enums.AttributeType, resolve: a => a.type }),
      referenceEntity: t.exposeString('referenceEntity', { nullable: true }),
      unit: t.field({ type: enums.AttributeUnit, nullable: true, resolve: a => a.unit }),
      isRequired: t.exposeBoolean('isRequired'),
      isFilterable: t.exposeBoolean('isFilterable'),
      organizationId: t.exposeInt('organizationId', { nullable: true }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        resolve: a => a.metadata as Record<string, unknown> | null,
      }),
      version: t.exposeInt('version'),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

      // Per-type choice connections. The drizzle plugin batches each relation
      // across the parent list (no N+1); `query` adds the org filter + ordering.
      // For any attribute, only the connection matching its `type` is populated.
      // `authScopes` is parent-aware (see `choiceAuthScope`): an org-owned
      // attribute is locked to its own org, a global one is arg-driven. The WHERE
      // stays arg-driven — correct because the gate guarantees `arg == parent.org`
      // for org-owned attributes.
      values: t.relatedConnection('values', {
        totalCount: true,
        args: { organizationId: t.arg.globalID({ for: 'Organization' }) },
        authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
        query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
      }),
      swatchValues: t.relatedConnection('swatchValues', {
        totalCount: true,
        args: { organizationId: t.arg.globalID({ for: 'Organization' }) },
        authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
        query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
      }),
      referenceValues: t.relatedConnection('referenceValues', {
        totalCount: true,
        args: { organizationId: t.arg.globalID({ for: 'Organization' }) },
        authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
        query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
      }),
    }),
  })
}
