// Attribute module — Pothos query fields.
//
// `attribute(id, slug)` — nullable single lookup by relay global-ID or slug; the
//                          org is derived from the looked-up row (org+admin).
// `attributes(where, orderBy, …)` — PLATFORM (admin) relay connection over
//                          org-null rows; needs the global `attribute:read` role.
// `organizationAttributes(organizationId, includeGlobal, …)` — ORG relay
//                          connection; org-only by default, platform ∪ org when
//                          `includeGlobal: true`; needs `attribute:read` in that org.
//
// Org is the EXPLICIT `organizationId` arg (a relay global id) — NO session-derived
// scoping. Visibility rule (mirrors AttributeService.visible()):
//   • org == null            → platform-only rows  { organizationId: { isNull: true } }
//   • org != null            → platform ∪ that org (includeGlobal default/true)
//   • org != null, !global   → that org's own rows only

import type { AttributeGraphQLSchemaBuilder } from '..'
import { Attribute } from '@czo/attribute/services'
import { Effect } from 'effect'
import { attributePermission, attributeReadScope, decodeOrgInput } from '../authz'

// ─────────────────────────────────────────────────────────────────────────────

export function registerAttributeQueries(builder: AttributeGraphQLSchemaBuilder): void {
  // ── attribute(id, slug) — nullable single lookup ──────────────────────────
  builder.queryField('attribute', t =>
    t.drizzleField({
      subGraphs: ['org', 'admin'],
      type: 'attributes',
      nullable: true,
      description: 'Fetch a single attribute by relay id or by slug. Access is gated on `attribute:read` for the looked-up row\'s own scope: a platform (org-null) attribute needs the global role, an org-owned one needs the role in its org. Returns null when no match is visible.',
      args: {
        id: t.arg.globalID({ for: 'Attribute', description: 'Relay global id of the Attribute to fetch. Provide either id or slug.' }),
        slug: t.arg.string({ description: 'Slug of the attribute to fetch. Provide either id or slug.' }),
      },
      // The org is derived from the looked-up row itself (by id or slug), not
      // client-supplied — see `attributeReadScope`. The fetch is therefore
      // unscoped; this authScope is the access gate.
      authScopes: (_root, args, ctx) => attributeReadScope(ctx, args),
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService

            // At least one of id / slug must be supplied.
            if (args.id == null && args.slug == null)
              return null

            // `t.arg.globalID({ for: 'Attribute' })` validates the typename at the
            // boundary and yields a parsed `{ typename, id }`; use its numeric id.
            const lookupWhere = args.id != null
              ? { id: Number(args.id.id) }
              : { slug: args.slug! }

            // Unscoped read — access was already gated on the row's own org.
            return yield* svc.findFirstUnscoped(query({ where: lookupWhere }))
          }).pipe(
            Effect.catchTag('AttributeNotFound', () => Effect.succeed(null)),
          ),
        ),
    }))

  // ── attributes — PLATFORM (admin): org-null rows only ─────────────────────
  builder.queryField('attributes', t =>
    t.drizzleConnection({
      subGraphs: ['admin'],
      type: 'attributes',
      description: 'Paginated (relay) connection over platform attributes (owned by no organization). Requires the global attribute:read role.',
      authScopes: () => attributePermission('read', null),
      args: {
        where: t.arg({ type: 'AttributeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['AttributeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const configWhere = userWhere != null ? { AND: [userWhere] } : undefined
            return yield* svc.findMany(
              query({
                where: configWhere,
                orderBy: args.orderBy?.length ? args.orderBy.map(o => ({ [o.field]: o.direction })) : { createdAt: 'desc' },
              }),
              { organizationId: null },
            )
          }),
        ),
    }, { subGraphs: ['admin'] }, { subGraphs: ['admin'] }))

  // ── organizationAttributes — ORG: org-only by default, platform ∪ org when includeGlobal ──
  builder.queryField('organizationAttributes', t =>
    t.drizzleConnection({
      subGraphs: ['org'],
      type: 'attributes',
      description: 'Paginated (relay) connection over an organization\'s attributes. By default returns only that org\'s own attributes; set `includeGlobal: true` to also include platform (global) attributes. Requires attribute:read in the given organization.',
      authScopes: (_root, args) => attributePermission('read', decodeOrgInput(args.organizationId)),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization', required: true, description: 'Viewer organization whose attributes to list.' }),
        includeGlobal: t.arg.boolean({ defaultValue: false, description: 'When true, also include platform (global, org-null) attributes alongside this org\'s. Defaults to false (org-only).' }),
        where: t.arg({ type: 'AttributeWhereInput', description: 'Optional filter predicate.' }),
        orderBy: t.arg({ type: ['AttributeOrderByInput'], description: 'Optional ordering clauses; defaults to newest-first (createdAt desc).' }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService
            const userWhere = (args.where ?? null) as Record<string, unknown> | null
            const configWhere = userWhere != null ? { AND: [userWhere] } : undefined
            return yield* svc.findMany(
              query({
                where: configWhere,
                orderBy: args.orderBy?.length ? args.orderBy.map(o => ({ [o.field]: o.direction })) : { createdAt: 'desc' },
              }),
              { organizationId: decodeOrgInput(args.organizationId), includeGlobal: args.includeGlobal ?? false },
            )
          }),
        ),
    }, { subGraphs: ['org'] }, { subGraphs: ['org'] }))
}
