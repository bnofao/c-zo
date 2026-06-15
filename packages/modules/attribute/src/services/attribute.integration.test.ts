import type { Database } from '@czo/kit/db'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import { attributeValues } from '../database/schema'
import { AttributePostgresLayer, truncateAttribute } from '../testing/postgres'
import { layer as attributeLayer, AttributeService, OptimisticLockError, UnitNotAllowed } from './attribute'

const TestLayer = attributeLayer.pipe(
  Layer.provideMerge(AttributePostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('AttributeService integration', (it) => {
  it.effect('create — assigns slug + version=1; findFirst returns it', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const created = yield* svc.create({
        name: 'Material',
        type: 'DROPDOWN',
        organizationId: null,
      })

      expect(created.slug).toBe('material')
      expect(created.version).toBe(1)

      const found = yield* svc.findFirst({ where: { id: created.id } }, { organizationId: null })
      expect(found.id).toBe(created.id)
      expect(found.slug).toBe('material')
    }))

  it.effect('create — duplicate slug → AttributeSlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      yield* svc.create({ name: 'Color', type: 'SWATCH', organizationId: null })

      const err = yield* svc
        .create({ name: 'Color', type: 'SWATCH', organizationId: null })
        .pipe(Effect.flip)

      expect(err._tag).toBe('AttributeSlugTaken')
    }))

  it.effect('create — REFERENCE without referenceEntity → ReferenceEntityRequired', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const err = yield* svc
        .create({ name: 'Brand', type: 'REFERENCE', organizationId: null })
        .pipe(Effect.flip)

      expect(err._tag).toBe('ReferenceEntityRequired')
    }))

  it.effect('create — referenceEntity on a non-REFERENCE type → ReferenceEntityNotAllowed', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const err = yield* svc
        .create({ name: 'Material', type: 'DROPDOWN', referenceEntity: 'product', organizationId: null })
        .pipe(Effect.flip)

      expect(err._tag).toBe('ReferenceEntityNotAllowed')
    }))

  it.effect('create — unit on a non-NUMERIC type → UnitNotAllowed', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const err = yield* svc
        .create({ name: 'Material', type: 'DROPDOWN', unit: 'KILOGRAM', organizationId: null })
        .pipe(Effect.flip)

      expect(err._tag).toBe('UnitNotAllowed')
    }))

  it.effect('update — set unit on a non-NUMERIC attribute → UnitNotAllowed', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const created = yield* svc.create({ name: 'Material', type: 'DROPDOWN', organizationId: null })
      const err = yield* svc
        .update(created.id, created.version, { unit: 'KILOGRAM' })
        .pipe(Effect.flip)

      // `update`'s error union includes OptimisticLockError (no `_tag`), so the
      // union doesn't expose `_tag`; assert the concrete error via instanceof.
      expect(err).toBeInstanceOf(UnitNotAllowed)
    }))

  it.effect('findMany — org visibility filter (acme + platform, not globex)', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      yield* svc.create({ name: 'Platform', slug: 'platform', type: 'DROPDOWN', organizationId: null })
      yield* svc.create({ name: 'Acme', slug: 'acme', type: 'DROPDOWN', organizationId: 1 })
      yield* svc.create({ name: 'Globex', slug: 'globex', type: 'DROPDOWN', organizationId: 2 })

      const rows = yield* svc.findMany(undefined, { organizationId: 1 })
      const slugs = rows.map(r => r.slug).sort()
      expect(slugs).toEqual(['acme', 'platform'])
    }))

  it.effect('findMany — no active org (null scope) sees platform-only, never other orgs', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      yield* svc.create({ name: 'Platform', slug: 'platform', type: 'DROPDOWN', organizationId: null })
      yield* svc.create({ name: 'Acme', slug: 'acme', type: 'DROPDOWN', organizationId: 1 })
      yield* svc.create({ name: 'Globex', slug: 'globex', type: 'DROPDOWN', organizationId: 2 })

      // null scope = caller with no active org → platform rows only (NOT a
      // see-everything admin scope — that would leak other orgs' attributes).
      const rows = yield* svc.findMany(undefined, { organizationId: null })
      expect(rows.map(r => r.slug)).toEqual(['platform'])
    }))

  it.effect('findById — finds any org row regardless of visibility scope', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const acme = yield* svc.create({ name: 'Acme', slug: 'acme', type: 'DROPDOWN', organizationId: 1 })
      // findById ignores org visibility (used by existence checks + authz org lookup).
      const found = yield* svc.findById(acme.id)
      expect(found.id).toBe(acme.id)
      expect(found.organizationId).toBe(1)

      const missing = yield* svc.findById(999_999).pipe(Effect.flip)
      expect(missing._tag).toBe('AttributeNotFound')
    }))

  it.effect('findFirstUnscoped — finds any org row by config, ignoring visibility', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const acme = yield* svc.create({ name: 'Acme', slug: 'acme', type: 'DROPDOWN', organizationId: 1 })
      // Unscoped lookup by slug — no org filter (the single `attribute` query
      // authorizes on the row's own org, then fetches unscoped).
      const found = yield* svc.findFirstUnscoped({ where: { slug: 'acme' } })
      expect(found.id).toBe(acme.id)
      expect(found.organizationId).toBe(1)

      const missing = yield* svc.findFirstUnscoped({ where: { slug: 'nope' } }).pipe(Effect.flip)
      expect(missing._tag).toBe('AttributeNotFound')
    }))

  it.effect('update — bumps version; stale expectedVersion → OptimisticLockError', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const created = yield* svc.create({ name: 'Size', type: 'DROPDOWN', organizationId: null })
      expect(created.version).toBe(1)

      const updated = yield* svc.update(created.id, created.version, { isRequired: true })
      expect(updated.version).toBe(2)
      expect(updated.isRequired).toBe(true)

      // Reusing the now-stale expectedVersion (1) must fail with a lock error.
      const err = yield* svc
        .update(created.id, created.version, { isRequired: false })
        .pipe(Effect.flip)
      // OptimisticLockError is a kit `Error` subclass (no `_tag`), so assert via instanceof.
      expect(err).toBeInstanceOf(OptimisticLockError)
    }))

  it.effect('delete — returns the row and CASCADEs to attribute_values', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      const db = (yield* DrizzleDb) as Database<Relations>

      const created = yield* svc.create({ name: 'Finish', type: 'DROPDOWN', organizationId: null })

      yield* db.insert(attributeValues).values({
        attributeId: created.id,
        organizationId: null,
        slug: 'matte',
        value: 'Matte',
      })

      const childBefore = yield* db.query.attributeValues.findMany({
        where: { attributeId: created.id },
      })
      expect(childBefore).toHaveLength(1)

      const deleted = yield* svc.delete(created.id)
      expect(deleted.id).toBe(created.id)

      const parentGone = yield* db.query.attributes.findMany({ where: { id: created.id } })
      expect(parentGone).toHaveLength(0)

      const childAfter = yield* db
        .select()
        .from(attributeValues)
        .where(eq(attributeValues.attributeId, created.id))
      expect(childAfter).toHaveLength(0)
    }))

  it.effect('promoteToGlobal — flips an org attribute AND its value catalog to global', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService
      const db = (yield* DrizzleDb) as Database<Relations>

      const created = yield* svc.create({ name: 'Acme Finish', type: 'DROPDOWN', organizationId: 1 })
      expect(created.organizationId).toBe(1)

      yield* db.insert(attributeValues).values([
        { attributeId: created.id, organizationId: 1, slug: 'matte', value: 'Matte' },
        { attributeId: created.id, organizationId: 1, slug: 'gloss', value: 'Gloss' },
      ])

      const promoted = yield* svc.promoteToGlobal(created.id)
      expect(promoted.organizationId).toBeNull()
      // version is bumped on the promote write.
      expect(promoted.version).toBe(created.version + 1)

      const values = yield* db
        .select()
        .from(attributeValues)
        .where(eq(attributeValues.attributeId, created.id))
      expect(values).toHaveLength(2)
      for (const v of values)
        expect(v.organizationId).toBeNull()
    }))

  it.effect('promoteToGlobal — already-global attribute is returned unchanged', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeService

      const created = yield* svc.create({ name: 'Platform Finish', type: 'DROPDOWN', organizationId: null })

      const promoted = yield* svc.promoteToGlobal(created.id)
      expect(promoted.organizationId).toBeNull()
      // No-op: version untouched.
      expect(promoted.version).toBe(created.version)
    }))
})
