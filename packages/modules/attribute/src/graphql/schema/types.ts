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
import { attributePermission, decodeOrgInput } from '../authz'
import { attributeEnumRefs } from './enums'

/** Visibility `where` for a choice table: platform rows, plus the requested org's rows. */
function choiceWhere(args: { organizationId?: { id: string } | null }) {
  const org = decodeOrgInput(args.organizationId)
  return org == null
    ? { organizationId: { isNull: true as const } }
    : { OR: [{ organizationId: { isNull: true as const } }, { organizationId: org }] }
}

/**
 * Parent-aware authScope for a choice connection. Reuses the same `attribute:read`
 * tiers as `attribute(id)` / `attributes` / `node()` (`attributePermission`), so a
 * value read is never a weaker path than the attribute it belongs to.
 *
 * - Org-owned attribute (`parentOrg = X`): the connection only ever exposes X's
 *   rows, so the arg MUST name X and the caller needs `attribute:read` in X. A
 *   foreign arg (or a missing one) is denied — passing another org on a private
 *   attribute is a meaningless, leak-shaped request, and this is what stops
 *   `node(id:)` from leaking a private attribute's values.
 * - Platform attribute (`parentOrg = null`): no arg → GLOBAL `attribute:read`;
 *   an arg `O` → the member role in `O` (cross-tenant gate).
 */
function choiceAuthScope(parentOrg: number | null, args: { organizationId?: { id: string } | null }) {
  const arg = decodeOrgInput(args.organizationId)
  if (parentOrg != null)
    return arg === parentOrg ? attributePermission('read', parentOrg) : false
  return attributePermission('read', arg)
}

/**
 * The `node(id:)` read scope for any attribute-domain row, derived from its own
 * org — used by the kit node-guard registry (`graphql/node-guards.ts`) for the
 * Attribute node AND every value node, so the relay `node`/`nodes` path is gated
 * uniformly (a denied node resolves to null). It is exactly the query-path gate
 * (`attributePermission('read', org)` = `tierScope`), so node() is never a weaker
 * path than `attribute(id)` / `attributes`.
 */
export function nodeReadScope(attr: { organizationId: number | null }) {
  return attributePermission('read', attr.organizationId)
}

export function registerAttributeTypes(builder: AttributeGraphQLSchemaBuilder): void {
  const enums = attributeEnumRefs()

  // ── Choice value objects ───────────────────────────────────────────────────
  builder.drizzleNode('attributeValues', {
    name: 'AttributeValue',
    subGraphs: ['org', 'admin'],
    description: 'A catalog value of a DROPDOWN or MULTISELECT attribute.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug', { description: 'URL-safe slug, unique within the attribute and scope.' }),
      value: t.exposeString('value', { description: 'Human-readable label of the value.' }),
      position: t.exposeInt('position', { description: 'Sort order among the attribute\'s values.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeSwatchValues', {
    name: 'AttributeSwatchValue',
    subGraphs: ['org', 'admin'],
    description: 'A catalog value of a SWATCH attribute: a label plus an optional color and/or image file.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug', { description: 'URL-safe slug, unique within the attribute and scope.' }),
      value: t.exposeString('value', { description: 'Human-readable label of the swatch.' }),
      color: t.exposeString('color', { nullable: true, description: 'Optional color (e.g. a hex code) representing the swatch.' }),
      position: t.exposeInt('position', { description: 'Sort order among the attribute\'s swatch values.' }),
      // Composed `file` field — present only when a file URL is stored.
      file: t.field({
        type: 'FileInfo',
        nullable: true,
        description: 'Optional image file backing the swatch; null when none is stored.',
        resolve: (row): FileInfo | null =>
          row.fileUrl != null ? { url: row.fileUrl, mimetype: row.mimetype ?? '' } : null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeReferenceValues', {
    name: 'AttributeReferenceValue',
    subGraphs: ['org', 'admin'],
    description: 'A catalog value of a REFERENCE attribute: a label pointing at another entity by id.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      slug: t.exposeString('slug', { description: 'URL-safe slug, unique within the attribute and scope.' }),
      value: t.exposeString('value', { description: 'Human-readable label of the reference.' }),
      referenceId: t.exposeInt('referenceId', { description: 'Id of the referenced entity (interpreted per the attribute\'s referenceEntity).' }),
      position: t.exposeInt('position', { description: 'Sort order among the attribute\'s reference values.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  // ── Typed value objects ────────────────────────────────────────────────────
  builder.drizzleNode('attributeTextValues', {
    name: 'AttributeTextValue',
    subGraphs: ['org', 'admin'],
    description: 'The single value of a TEXT attribute: plain text plus optional structured rich content.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      plain: t.exposeString('plain', { description: 'Plain-text representation of the value.' }),
      rich: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Optional structured rich-text payload (e.g. a document AST); null when unset.',
        resolve: row => row.rich as Record<string, unknown> | null,
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeNumericValues', {
    name: 'AttributeNumericValue',
    subGraphs: ['org', 'admin'],
    description: 'The single value of a NUMBER attribute (interpreted in the attribute\'s unit, when set).',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.exposeFloat('value', { description: 'The numeric value.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeBooleanValues', {
    name: 'AttributeBooleanValue',
    subGraphs: ['org', 'admin'],
    description: 'The single value of a BOOLEAN attribute.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.exposeBoolean('value', { description: 'The boolean value.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeDateValues', {
    name: 'AttributeDateValue',
    subGraphs: ['org', 'admin'],
    description: 'The single value of a DATE or DATETIME attribute.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      value: t.expose('value', { type: 'DateTime', description: 'The date/time value.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
    }),
  })

  builder.drizzleNode('attributeFileValues', {
    name: 'AttributeFileValue',
    subGraphs: ['org', 'admin'],
    description: 'The single value of a FILE attribute: the stored file reference.',
    select: true,
    id: { column: v => v.id },
    fields: t => ({
      file: t.field({
        type: 'FileInfo',
        description: 'The stored file (URL + MIME type).',
        resolve: (row): FileInfo => ({ url: row.fileUrl, mimetype: row.mimetype }),
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),
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
    subGraphs: ['org', 'admin'],
    description: 'A typed descriptor that products and variants can carry values for. PLATFORM (organizationId null, platform-admin-managed) or ORG-OWNED. Choice types expose one of the values/swatchValues/referenceValues connections (per `type`); non-choice types hold a single typed value resolved elsewhere.',
    select: true,
    id: { column: a => a.id },
    fields: t => ({
      name: t.exposeString('name', { description: 'Human-readable attribute name.' }),
      slug: t.exposeString('slug', { description: 'URL-safe slug, unique within the attribute\'s scope.' }),
      type: t.field({ type: enums.AttributeType, resolve: a => a.type, description: 'The attribute\'s type, which fixes how its value(s) are stored and which value connection is populated.' }),
      referenceEntity: t.exposeString('referenceEntity', { nullable: true, description: 'For REFERENCE attributes, the name of the entity its values point at; null otherwise.' }),
      unit: t.field({ type: enums.AttributeUnit, nullable: true, resolve: a => a.unit, description: 'For NUMBER attributes, the unit of measure; null otherwise.' }),
      isRequired: t.exposeBoolean('isRequired', { description: 'Whether a value for this attribute is mandatory on the entities that carry it.' }),
      isFilterable: t.exposeBoolean('isFilterable', { description: 'Whether this attribute may be used as a storefront/listing filter facet.' }),
      organizationId: t.exposeInt('organizationId', { nullable: true, description: 'Owning organization, or null for a PLATFORM (global) attribute.' }),
      metadata: t.field({
        type: 'JSONObject',
        nullable: true,
        description: 'Freeform JSON metadata attached to the attribute.',
        resolve: a => a.metadata as Record<string, unknown> | null,
      }),
      version: t.exposeInt('version', { description: 'Optimistic-lock version, incremented on each update.' }),
      createdAt: t.expose('createdAt', { type: 'DateTime', description: 'Timestamp when this row was created.' }),
      updatedAt: t.expose('updatedAt', { type: 'DateTime', description: 'Timestamp when this row was last updated.' }),

      // Per-type choice connections. The drizzle plugin batches each relation
      // across the parent list (no N+1); `query` adds the org filter + ordering.
      // For any attribute, only the connection matching its `type` is populated.
      // `authScopes` is parent-aware (see `choiceAuthScope`): an org-owned
      // attribute is locked to its own org, a global one is arg-driven. The WHERE
      // stays arg-driven — correct because the gate guarantees `arg == parent.org`
      // for org-owned attributes.
      values: t.relatedConnection(
        'values',
        {
          subGraphs: ['org', 'admin'],
          description: 'Catalog values for a DROPDOWN/MULTISELECT attribute (ordered by position); empty for other types.',
          totalCount: true,
          args: { organizationId: t.arg.globalID({ for: 'Organization', description: 'Viewer organization. For a global attribute, omit for platform-only values or supply an org to add its values; for an org-owned attribute it must name the owning org.' }) },
          authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
          query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
        },
        { subGraphs: ['org', 'admin'] },
        { subGraphs: ['org', 'admin'] },
      ),
      swatchValues: t.relatedConnection(
        'swatchValues',
        {
          subGraphs: ['org', 'admin'],
          description: 'Catalog values for a SWATCH attribute (ordered by position); empty for other types.',
          totalCount: true,
          args: { organizationId: t.arg.globalID({ for: 'Organization', description: 'Viewer organization. For a global attribute, omit for platform-only values or supply an org to add its values; for an org-owned attribute it must name the owning org.' }) },
          authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
          query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
        },
        { subGraphs: ['org', 'admin'] },
        { subGraphs: ['org', 'admin'] },
      ),
      referenceValues: t.relatedConnection(
        'referenceValues',
        {
          subGraphs: ['org', 'admin'],
          description: 'Catalog values for a REFERENCE attribute (ordered by position); empty for other types.',
          totalCount: true,
          args: { organizationId: t.arg.globalID({ for: 'Organization', description: 'Viewer organization. For a global attribute, omit for platform-only values or supply an org to add its values; for an org-owned attribute it must name the owning org.' }) },
          authScopes: (parent, args) => choiceAuthScope(parent.organizationId, args),
          query: args => ({ where: choiceWhere(args), orderBy: { position: 'asc' as const } }),
        },
        { subGraphs: ['org', 'admin'] },
        { subGraphs: ['org', 'admin'] },
      ),
    }),
  })
}
