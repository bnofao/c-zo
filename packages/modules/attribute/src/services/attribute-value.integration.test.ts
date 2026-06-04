import type { Database } from '@czo/kit/db'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { attributes } from '../database/schema'
import { AttributePostgresLayer, truncateAttribute } from '../testing/postgres'
import { layer as attributeValueLayer, AttributeValueService } from './attribute-value'

const TestLayer = attributeValueLayer.pipe(
  Layer.provideMerge(AttributePostgresLayer),
)

/** Insert a parent attribute directly and return its id. */
function seedAttribute(
  slug: string,
  type: 'DROPDOWN' | 'SWATCH' | 'REFERENCE' = 'DROPDOWN',
  organizationId: number | null = null,
) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const [row] = yield* db
      .insert(attributes)
      .values({
        name: slug,
        slug,
        type,
        // chk_reference_entity requires REFERENCE attributes to name an entity.
        referenceEntity: type === 'REFERENCE' ? 'brand' : null,
        organizationId,
      })
      .returning()
    return row!.id
  })
}

layer(TestLayer, { timeout: 120_000 })('AttributeValueService integration', (it) => {
  it.effect('createValue — auto slug + position (0 then 1)', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('material')

      const first = yield* svc.createValue({ attributeId, value: 'Solid Wood', organizationId: null })
      expect(first.slug).toBe('solid-wood')
      expect(first.position).toBe(0)

      const second = yield* svc.createValue({ attributeId, value: 'Plywood', organizationId: null })
      expect(second.slug).toBe('plywood')
      expect(second.position).toBe(1)
    }))

  it.effect('createValue — duplicate slug within attribute → AttributeValueSlugTaken', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('color')

      yield* svc.createValue({ attributeId, value: 'Red', organizationId: null })

      const err = yield* svc
        .createValue({ attributeId, value: 'Red', organizationId: null })
        .pipe(Effect.flip)

      expect(err._tag).toBe('AttributeValueSlugTaken')
    }))

  it.effect('createSwatch — visual validation + file mapping', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('finish', 'SWATCH')

      // Neither color nor file → SwatchRequiresColorOrFile.
      const missing = yield* svc
        .createSwatch({ attributeId, value: 'Bare', organizationId: null })
        .pipe(Effect.flip)
      expect(missing._tag).toBe('SwatchRequiresColorOrFile')

      // color → ok.
      const colored = yield* svc.createSwatch({ attributeId, value: 'White', color: '#fff', organizationId: null })
      expect(colored.color).toBe('#fff')

      // file → maps to fileUrl + mimetype.
      const filed = yield* svc.createSwatch({
        attributeId,
        value: 'Textured',
        file: { url: 'https://cdn/x.png', mimetype: 'image/png' },
        organizationId: null,
      })
      expect(filed.fileUrl).toBe('https://cdn/x.png')
      expect(filed.mimetype).toBe('image/png')
    }))

  it.effect('updateSwatch — invalid visual → SwatchVisualInvalid; both cleared → SwatchRequiresColorOrFile', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('finish', 'SWATCH')
      const swatch = yield* svc.createSwatch({ attributeId, value: 'White', color: '#fff', organizationId: null })

      // Invalid hex color on update → the typed SwatchVisualInvalid (NOT an opaque
      // AttributeDbFailed — the bug this guards: updateSwatch mapped it wrong).
      const invalid = yield* svc
        .updateSwatch(swatch.id, { color: 'notahex' })
        .pipe(Effect.flip)
      expect(invalid._tag).toBe('SwatchVisualInvalid')

      // Clearing both color and file → SwatchRequiresColorOrFile.
      const bare = yield* svc
        .updateSwatch(swatch.id, { color: null, file: null })
        .pipe(Effect.flip)
      expect(bare._tag).toBe('SwatchRequiresColorOrFile')
    }))

  it.effect('createReference — sets referenceId; duplicate (attribute, referenceId) → AttributeDbFailed', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('brand', 'REFERENCE')

      const ref = yield* svc.createReference({ attributeId, value: 'Acme', referenceId: 42, organizationId: null })
      expect(ref.referenceId).toBe(42)

      const err = yield* svc
        .createReference({ attributeId, value: 'Acme Dup', referenceId: 42, organizationId: null })
        .pipe(Effect.flip)
      expect(err._tag).toBe('AttributeDbFailed')
    }))

  it.effect('reorderValues — reindexes positions to 0,1,2 in given order', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('size')

      const a = yield* svc.createValue({ attributeId, value: 'A', organizationId: null })
      const b = yield* svc.createValue({ attributeId, value: 'B', organizationId: null })
      const c = yield* svc.createValue({ attributeId, value: 'C', organizationId: null })

      yield* svc.reorderValues(attributeId, [c.id, a.id, b.id])

      const db = (yield* DrizzleDb) as Database<Relations>
      const rows = yield* db.query.attributeValues.findMany({ where: { attributeId } })
      const byId = new Map(rows.map(r => [r.id, r.position]))
      expect(byId.get(c.id)).toBe(0)
      expect(byId.get(a.id)).toBe(1)
      expect(byId.get(b.id)).toBe(2)
    }))

  it.effect('createValue — org extends a PLATFORM attribute (parent org null)', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('platform-color', 'DROPDOWN', null)

      // Acme (org 1) grafts an org-value onto a platform attribute → ok.
      const created = yield* svc.createValue({ attributeId, value: 'Crimson', organizationId: 1 })
      expect(created.organizationId).toBe(1)
    }))

  it.effect('createValue — org adds to its OWN attribute (parent org == value org)', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('acme-fabric', 'DROPDOWN', 1)

      const created = yield* svc.createValue({ attributeId, value: 'Linen', organizationId: 1 })
      expect(created.organizationId).toBe(1)
    }))

  it.effect('createValue — org value on ANOTHER org\'s attribute → AttributeParentNotOwned', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      // Globex (org 2) owns the attribute; Acme (org 1) tries to add a value.
      const attributeId = yield* seedAttribute('globex-only', 'DROPDOWN', 2)

      const err = yield* svc
        .createValue({ attributeId, value: 'Sneaky', organizationId: 1 })
        .pipe(Effect.flip)
      expect(err._tag).toBe('AttributeParentNotOwned')
    }))

  it.effect('updateValue + deleteValue — basic cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* AttributeValueService
      const attributeId = yield* seedAttribute('weight')

      const created = yield* svc.createValue({ attributeId, value: 'Light', organizationId: null })

      const updated = yield* svc.updateValue(created.id, { value: 'Heavy' })
      expect(updated.value).toBe('Heavy')

      const deleted = yield* svc.deleteValue(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.query.attributeValues.findMany({ where: { id: created.id } })
      expect(gone).toHaveLength(0)
    }))
})
