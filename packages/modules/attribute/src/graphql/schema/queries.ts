// Attribute module — Pothos query fields.
//
// `attribute(id, slug, organizationId)` — nullable single lookup by relay
//                          global-ID or slug, scoped by an EXPLICIT org.
// `attributes(organizationId, where, orderBy, …)` — relay connection, same.
//
// Org is the EXPLICIT optional `organizationId` arg (a relay global id) — NO
// session-derived scoping. Both queries require `attribute:read`: omitting the
// arg scopes to platform rows and needs the GLOBAL role; supplying it scopes to
// platform ∪ that org and needs the member role IN that org (else a cross-org
// leak). Visibility rule (mirrors AttributeService.visible()):
//   • org == null  → platform-only rows  { organizationId: { isNull: true } }
//   • org != null  → platform ∪ that org

import type { Attribute as AttributeNs } from '@czo/attribute/services'
import type { AttributeGraphQLSchemaBuilder } from '..'
import { Attribute } from '@czo/attribute/services'
import { Effect } from 'effect'
import { attributePermission, attributeReadScope } from '../authz'

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Decode the explicit `organizationId` arg (parsed relay id) to a numeric org, or null. */
function argOrg(organizationId: { id: string } | null | undefined): number | null {
  return organizationId != null ? Number(organizationId.id) : null
}

/** `ReadScope` from the explicit org arg (null → platform-only view). */
function orgScope(organizationId: { id: string } | null | undefined): AttributeNs.ReadScope {
  return { organizationId: argOrg(organizationId) }
}

/**
 * authScope for the list: `attribute:read` is required in EVERY tier — matching
 * the single `attribute(id, slug)` gate so the same rows aren't readable one way
 * but not the other. No `organizationId` → checked against the caller's GLOBAL
 * role (platform reads); an explicit org → the member role IN that org (else the
 * arg would be a cross-org read leak).
 */
function orgAuthScope(organizationId: { id: string } | null | undefined) {
  return attributePermission('read', argOrg(organizationId))
}

// ─────────────────────────────────────────────────────────────────────────────

export function registerAttributeQueries(builder: AttributeGraphQLSchemaBuilder): void {
  // ── attribute(id, slug) — nullable single lookup ──────────────────────────
  builder.queryField('attribute', t =>
    t.drizzleField({
      type: 'attributes',
      nullable: true,
      args: {
        id: t.arg.globalID({ for: 'Attribute' }),
        slug: t.arg.string(),
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

  // ── attributes — paginated relay connection ───────────────────────────────
  builder.queryField('attributes', t =>
    t.drizzleConnection({
      type: 'attributes',
      // A list has no single row to derive an org from, so the org is the
      // EXPLICIT optional `organizationId` arg: omitted → platform only;
      // supplied → requires `attribute:read` in that org (see `orgAuthScope`).
      authScopes: (_root, args) => orgAuthScope(args.organizationId),
      args: {
        organizationId: t.arg.globalID({ for: 'Organization' }),
        where: t.arg({ type: 'AttributeWhereInput' }),
        orderBy: t.arg({ type: ['AttributeOrderByInput'] }),
      },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(
          Effect.gen(function* () {
            const svc = yield* Attribute.AttributeService

            const scope = orgScope(args.organizationId)
            const userWhere = (args.where ?? null) as Record<string, unknown> | null

            // Visibility is encoded via the service's `scope` parameter.
            // `findMany` merges `visible(scope)` with `config.where` as a flat
            // spread — that works for flat field filters but a top-level `OR` in
            // config.where would overwrite the visibility OR. To support arbitrary
            // user-supplied where (which may contain OR), wrap user where in an
            // AND so visible(scope)'s OR is never overwritten.
            const configWhere = userWhere != null
              ? { AND: [userWhere] }
              : undefined

            return yield* svc.findMany(
              query({
                where: configWhere,
                orderBy: args.orderBy?.length
                  ? args.orderBy.map(o => ({ [o.field]: o.direction }))
                  : { createdAt: 'desc' },
              }),
              scope,
            )
          }),
        ),
    }))
}
