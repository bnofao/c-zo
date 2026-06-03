import type { Database } from '@czo/kit/db'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { and, eq, isNull, or } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { attributeValues } from '../database/schema'
import { AttributePostgresLayer, truncateAttribute } from '../testing/postgres'
import { layer as attributeLayer, AttributeService } from './attribute'
import { layer as attributeValueLayer, AttributeValueService } from './attribute-value'

// Both services share the one Testcontainers Postgres so a test can create an
// attribute and graft values onto it within a single scope.
const TestLayer = Layer.mergeAll(attributeLayer, attributeValueLayer).pipe(
  Layer.provideMerge(AttributePostgresLayer),
)

/**
 * Read an attribute's choice values the way the GraphQL `Attribute.values`
 * resolver does — org-aware: platform rows (org null) ∪ the caller's org rows.
 * Returns the matching value slugs, sorted.
 */
function visibleValueSlugs(attributeId: number, callerOrg: number | null) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const orgFilter = callerOrg == null
      ? isNull(attributeValues.organizationId)
      : or(isNull(attributeValues.organizationId), eq(attributeValues.organizationId, callerOrg))
    const rows = yield* db
      .select({ slug: attributeValues.slug })
      .from(attributeValues)
      .where(and(eq(attributeValues.attributeId, attributeId), orgFilter))
    return rows.map(r => r.slug).sort()
  })
}

layer(TestLayer, { timeout: 120_000 })('hybrid platform/org scoping (spec §2)', (it) => {
  // ── Case 1 — admin platform attribute + values are readable by an org ──────
  it.effect('platform attribute + platform values are visible to an org', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const attrs = yield* AttributeService
      const values = yield* AttributeValueService

      const platform = yield* attrs.create({ name: 'Color', type: 'DROPDOWN', organizationId: null })
      yield* values.createValue({ attributeId: platform.id, value: 'Red', organizationId: null })
      yield* values.createValue({ attributeId: platform.id, value: 'Blue', organizationId: null })

      // Org 1 sees the platform attribute in its listing…
      const acmeList = yield* attrs.findMany(undefined, { organizationId: 1 })
      expect(acmeList.map(a => a.slug)).toContain('color')

      // …and the platform values on it.
      expect(yield* visibleValueSlugs(platform.id, 1)).toEqual(['blue', 'red'])
    }))

  // ── Case 2 — an org's own attribute is isolated from other orgs ────────────
  it.effect('org-owned attribute is visible only to that org', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const attrs = yield* AttributeService

      yield* attrs.create({ name: 'Acme Fabric', slug: 'acme-fabric', type: 'DROPDOWN', organizationId: 1 })

      const acme = yield* attrs.findMany(undefined, { organizationId: 1 })
      const globex = yield* attrs.findMany(undefined, { organizationId: 2 })
      const platformOnly = yield* attrs.findMany(undefined, { organizationId: null })

      expect(acme.map(a => a.slug)).toContain('acme-fabric')
      expect(globex.map(a => a.slug)).not.toContain('acme-fabric')
      expect(platformOnly.map(a => a.slug)).not.toContain('acme-fabric')
    }))

  // ── Case 3 — an org extends a platform attribute with an org-value ─────────
  it.effect('org extends a platform attribute; the org-value is private to it', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const attrs = yield* AttributeService
      const values = yield* AttributeValueService

      const platform = yield* attrs.create({ name: 'Color', type: 'DROPDOWN', organizationId: null })
      const platformValue = yield* values.createValue({ attributeId: platform.id, value: 'Red', organizationId: null })

      // Acme (org 1) grafts an org-value onto the platform attribute.
      const crimson = yield* values.createValue({ attributeId: platform.id, value: 'Crimson', organizationId: 1 })
      expect(crimson.organizationId).toBe(1)

      // Acme sees platform ∪ its own value; Globex sees only the platform value.
      expect(yield* visibleValueSlugs(platform.id, 1)).toEqual(['crimson', 'red'])
      expect(yield* visibleValueSlugs(platform.id, 2)).toEqual(['red'])

      // The platform value is untouched (still org null).
      const db = (yield* DrizzleDb) as Database<Relations>
      const [stored] = yield* db
        .select({ organizationId: attributeValues.organizationId })
        .from(attributeValues)
        .where(eq(attributeValues.id, platformValue.id))
      expect(stored!.organizationId).toBeNull()
    }))

  // ── Case 4 — cross-org graft is blocked by the integrity invariant ─────────
  it.effect('an org cannot graft a value onto another org\'s attribute', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const attrs = yield* AttributeService
      const values = yield* AttributeValueService

      const globex = yield* attrs.create({ name: 'Globex Fabric', slug: 'globex-fabric', type: 'DROPDOWN', organizationId: 2 })

      const err = yield* values
        .createValue({ attributeId: globex.id, value: 'Wool', organizationId: 1 })
        .pipe(Effect.flip)
      expect(err._tag).toBe('AttributeParentNotOwned')
    }))
})
