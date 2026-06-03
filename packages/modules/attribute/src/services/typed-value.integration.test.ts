import type { Database } from '@czo/kit/db'
import type { Relations } from '../database/relations'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import {
  attributeBooleanValues,
  attributeDateValues,
  attributeFileValues,
  attributeNumericValues,
  attributes,
  attributeTextValues,
} from '../database/schema'
import { AttributePostgresLayer, truncateAttribute } from '../testing/postgres'
import { layer as typedValueLayer, TypedValueService } from './typed-value'

const TestLayer = typedValueLayer.pipe(
  Layer.provideMerge(AttributePostgresLayer),
)

/** Insert a parent attribute directly and return its id. */
function seedAttribute(slug: string, type: typeof attributes.$inferInsert['type']) {
  return Effect.gen(function* () {
    const db = (yield* DrizzleDb) as Database<Relations>
    const [row] = yield* db
      .insert(attributes)
      .values({
        name: slug,
        slug,
        type,
        referenceEntity: null,
        unit: null,
        organizationId: null,
      })
      .returning()
    return row!.id
  })
}

layer(TestLayer, { timeout: 120_000 })('TypedValueService integration', (it) => {
  it.effect('text — create → update → delete cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService
      const attributeId = yield* seedAttribute('description', 'PLAIN_TEXT')

      // create
      const created = yield* svc.createText({
        attributeId,
        organizationId: null,
        plain: 'Hello world',
        rich: { type: 'doc', content: [] },
      })
      expect(created.plain).toBe('Hello world')
      expect(created.rich).toEqual({ type: 'doc', content: [] })
      expect(created.attributeId).toBe(attributeId)

      // update
      const updated = yield* svc.updateText(created.id, { plain: 'Updated text' })
      expect(updated.plain).toBe('Updated text')
      expect(updated.id).toBe(created.id)

      // delete
      const deleted = yield* svc.deleteText(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.select().from(attributeTextValues).where(eq(attributeTextValues.id, created.id))
      expect(gone).toHaveLength(0)
    }))

  it.effect('text — updateText missing id → TypedValueNotFound', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService

      const err = yield* svc.updateText(999_999, { plain: 'nope' }).pipe(Effect.flip)
      expect(err._tag).toBe('TypedValueNotFound')
    }))

  it.effect('numeric — create → update → delete cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService
      const attributeId = yield* seedAttribute('price', 'NUMERIC')

      const created = yield* svc.createNumeric({ attributeId, organizationId: null, value: 42.5 })
      // numeric mode:'number' — assert as number (Drizzle returns number with mode:'number')
      expect(typeof created.value).toBe('number')
      expect(created.value).toBeCloseTo(42.5)

      const updated = yield* svc.updateNumeric(created.id, { value: 99.99 })
      expect(updated.value).toBeCloseTo(99.99)

      const deleted = yield* svc.deleteNumeric(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.select().from(attributeNumericValues).where(eq(attributeNumericValues.id, created.id))
      expect(gone).toHaveLength(0)
    }))

  it.effect('boolean — create → update → delete cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService
      const attributeId = yield* seedAttribute('is-active', 'BOOLEAN')

      const created = yield* svc.createBoolean({ attributeId, organizationId: null, value: true })
      expect(created.value).toBe(true)

      const updated = yield* svc.updateBoolean(created.id, { value: false })
      expect(updated.value).toBe(false)

      const deleted = yield* svc.deleteBoolean(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.select().from(attributeBooleanValues).where(eq(attributeBooleanValues.id, created.id))
      expect(gone).toHaveLength(0)
    }))

  it.effect('date — create → update → delete cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService
      const attributeId = yield* seedAttribute('launch-date', 'DATE')

      const d1 = new Date('2024-01-15T10:00:00.000Z')
      const created = yield* svc.createDate({ attributeId, organizationId: null, value: d1 })
      expect(created.value).toBeInstanceOf(Date)
      expect(created.value.getTime()).toBe(d1.getTime())

      const d2 = new Date('2025-06-01T00:00:00.000Z')
      const updated = yield* svc.updateDate(created.id, { value: d2 })
      expect(updated.value.getTime()).toBe(d2.getTime())

      const deleted = yield* svc.deleteDate(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.select().from(attributeDateValues).where(eq(attributeDateValues.id, created.id))
      expect(gone).toHaveLength(0)
    }))

  it.effect('file — create → update → delete cycle', () =>
    Effect.gen(function* () {
      yield* truncateAttribute
      const svc = yield* TypedValueService
      const attributeId = yield* seedAttribute('product-image', 'FILE')

      const created = yield* svc.createFile({
        attributeId,
        organizationId: null,
        fileUrl: 'https://cdn.example.com/image.png',
        mimetype: 'image/png',
      })
      expect(created.fileUrl).toBe('https://cdn.example.com/image.png')
      expect(created.mimetype).toBe('image/png')

      const updated = yield* svc.updateFile(created.id, {
        fileUrl: 'https://cdn.example.com/image-v2.png',
        mimetype: 'image/webp',
      })
      expect(updated.fileUrl).toBe('https://cdn.example.com/image-v2.png')
      expect(updated.mimetype).toBe('image/webp')

      const deleted = yield* svc.deleteFile(created.id)
      expect(deleted.id).toBe(created.id)

      const db = (yield* DrizzleDb) as Database<Relations>
      const gone = yield* db.select().from(attributeFileValues).where(eq(attributeFileValues.id, created.id))
      expect(gone).toHaveLength(0)
    }))
})
