// Attribute module — authorization helpers for the GraphQL mutation gates.
//
// One mechanism for both tiers: auth's `permission` scope (`resource: 'attribute'`),
// which reuses the `attribute:{viewer,manager,admin}` hierarchy this module
// registers in `onStart`.
//   • ORG tier      — resource owned by an org (`organizationId` is a number):
//                     `{ permission: { …, organization } }` → checked against the
//                     caller's MEMBER role in that org.
//   • PLATFORM tier — resource with `organizationId == null`:
//                     `{ permission: { … } }` (NO organization) → checked against
//                     the caller's GLOBAL role (`users.role`). A platform manager
//                     just needs the `attribute:*` permission globally — no
//                     hard-coded admin check.
//
// By-id mutations derive the owning org from the resource (so the gate can pick
// the right tier). Three resolutions are possible:
//   • a number    → ORG tier   → `{ permission: { …, organization } }`
//   • `null`       → PLATFORM   → `{ permission: { … } }` (no org → global role)
//   • `undefined`  → UNKNOWN    → `{ auth: true }` and defer to the service's
//                                 NotFound (404), never mask existence as a 403.

import type { Relations } from '@czo/attribute/relations'
import type { Database } from '@czo/kit/db'
import type { GraphQLContextMap } from '@czo/kit/graphql'
import { DrizzleDb } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import {
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributeReferenceValues,
  attributes,
  attributeSwatchValues,
  attributeTextValues,
  attributeValues,
} from '../database/schema'

/** A column carrying the org owner of a value row. */
type OrgColumnTable
  = typeof attributeValues
    | typeof attributeSwatchValues
    | typeof attributeReferenceValues
    | typeof attributeTextValues
    | typeof attributeNumericValues
    | typeof attributeBooleanValues
    | typeof attributeDateValues
    | typeof attributeFileValues

/** Maps a value "family" id to the table that owns the `organizationId` column. */
export const VALUE_TABLE = {
  value: attributeValues,
  swatch: attributeSwatchValues,
  reference: attributeReferenceValues,
  text: attributeTextValues,
  numeric: attributeNumericValues,
  boolean: attributeBooleanValues,
  date: attributeDateValues,
  file: attributeFileValues,
} as const satisfies Record<string, OrgColumnTable>

export type ValueFamily = keyof typeof VALUE_TABLE

/**
 * Resolve an attribute's owning org from its numeric id.
 *   • number      → org-owned attribute  (ORG tier)
 *   • `null`       → platform attribute    (PLATFORM tier)
 *   • `undefined`  → no live row matches   (UNKNOWN — defer to 404)
 *
 * Projects only `organizationId` (no full-row hydration) and is unscoped so the
 * gate sees the resource regardless of the caller's org; the per-org decision is
 * made by the returned tier, not here. Mirrors `loadValueOrg`/`loadAttributeOrgBySlug`.
 */
export function loadAttributeOrg(
  ctx: GraphQLContextMap,
  attributeId: number,
): Promise<number | null | undefined> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const [row] = yield* db
        .select({ organizationId: attributes.organizationId })
        .from(attributes)
        .where(eq(attributes.id, attributeId))
        .limit(1)
      // `undefined` → unknown; otherwise the row's org (`null` = platform).
      return row === undefined ? undefined : row.organizationId
    }),
  )
}

/**
 * Resolve a VALUE row's owning org from its numeric id. The value carries
 * its own `organizationId` (set from the caller's active org at create time),
 * so the gate authorizes against the value's effective org directly — a caller
 * may only mutate values whose org is their own (ORG tier) or platform values
 * when platform-admin (`organizationId == null`).
 *
 *   • number      → org-owned value   (ORG tier)
 *   • `null`       → platform value     (PLATFORM tier)
 *   • `undefined`  → no row matches     (UNKNOWN — defer to 404)
 */
export function loadValueOrg(
  ctx: GraphQLContextMap,
  family: ValueFamily,
  valueId: number,
): Promise<number | null | undefined> {
  const table = VALUE_TABLE[family]
  return ctx.runEffect(
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const [row] = yield* db
        .select({ organizationId: table.organizationId })
        .from(table)
        .where(eq(table.id, valueId))
        .limit(1)
      return row === undefined ? undefined : row.organizationId
    }),
  )
}

/**
 * Decode the optional `organizationId` relay input of a create mutation:
 *   • omitted / `null` → `null` (platform-tier resource)
 *   • a parsed relay global id → its numeric org id (org-tier resource)
 * Mirrors `createAttribute`. The chosen org is the SUBJECT of the `permission`
 * gate (which verifies membership), so it is safe to take from client input.
 */
export function decodeOrgInput(org: { id: string } | null | undefined): number | null {
  return org == null ? null : Number(org.id)
}

type Verb = 'create' | 'read' | 'update' | 'delete'

/**
 * Build the `permission` authScope for a tier:
 *   • `org` a number → ORG tier (check the member role in that org).
 *   • `org` null     → PLATFORM tier (no `organization` → check the global role).
 */
export function attributePermission(verb: Verb, org: number | null) {
  return org == null
    ? { permission: { resource: 'attribute', actions: [verb] } }
    : { permission: { resource: 'attribute', actions: [verb], organization: org } }
}

/**
 * Tier resolver for by-resource gates: `undefined` (unknown row) → `{ auth: true }`
 * so the service surfaces a 404, never a 403; otherwise the `permission` gate for
 * the resource's tier (platform when `null`, org when a number).
 */
export function tierScope(org: number | null | undefined, verb: Verb) {
  return org === undefined ? { auth: true as const } : attributePermission(verb, org)
}

/**
 * authScope for a value CREATE, keyed on the client-supplied target org (the
 * value's `organizationId` input, same convention as `createAttribute`):
 *   • a number → ORG tier → caller must be a member with `attribute:create`.
 *   • null     → PLATFORM tier → caller must hold global `attribute:create`.
 * Parent-ownership integrity (a value may only graft onto a platform attribute or
 * one's own) is enforced server-side in the service (spec §2), not by this gate.
 */
export function valueCreateScope(org: { id: string } | null | undefined) {
  return attributePermission('create', decodeOrgInput(org))
}

/** authScope for a by-value-id mutation (update / delete) — tier from the value's own org. */
export async function valueScope(
  ctx: GraphQLContextMap,
  family: ValueFamily,
  valueId: number,
  verb: 'update' | 'delete',
) {
  return tierScope(await loadValueOrg(ctx, family, valueId), verb)
}

/** authScope for any mutation keyed by an attribute's id (update / delete / reorder) — tier from the attribute's org. */
export async function attributeScope(
  ctx: GraphQLContextMap,
  attributeId: number,
  verb: 'update' | 'delete',
) {
  return tierScope(await loadAttributeOrg(ctx, attributeId), verb)
}

/**
 * Resolve an attribute's owning org from its (globally unique) slug — the slug
 * sibling of `loadAttributeOrg`. `undefined` when no row matches (defer to 404).
 */
export function loadAttributeOrgBySlug(
  ctx: GraphQLContextMap,
  slug: string,
): Promise<number | null | undefined> {
  return ctx.runEffect(
    Effect.gen(function* () {
      const db = (yield* DrizzleDb) as Database<Relations>
      const [row] = yield* db
        .select({ organizationId: attributes.organizationId })
        .from(attributes)
        .where(eq(attributes.slug, slug))
        .limit(1)
      return row === undefined ? undefined : row.organizationId
    }),
  )
}

/**
 * authScope for the single `attribute(id, slug)` read — the org is derived from
 * the looked-up row itself (by id or slug), never client-supplied. Platform rows
 * need only auth; an org row requires `attribute:read` in that org. An unknown
 * row → `{ auth: true }`, deferring to the resolver's NotFound (404).
 */
export async function attributeReadScope(
  ctx: GraphQLContextMap,
  args: { id?: { id: string } | null, slug?: string | null },
) {
  const org = args.id != null
    ? await loadAttributeOrg(ctx, Number(args.id.id))
    : args.slug != null
      ? await loadAttributeOrgBySlug(ctx, args.slug)
      : undefined
  return tierScope(org, 'read')
}
