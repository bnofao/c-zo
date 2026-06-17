import * as attributeSchema from '@czo/attribute/schema'
import { DrizzleDb } from '@czo/kit/db'
import { expect, layer } from '@effect/vitest'
import { Effect } from 'effect'
import * as productSchema from '../database/schema'
import { ProductAttributeLayer, truncateProductAttribute } from '../testing/cross-module-postgres'

/**
 * GATING SPIKE (F2). Proves Drizzle RQBv2 can resolve a nested cross-module
 * relational `where` traversing from `productAttributeValues` into the
 * `@czo/attribute` typed-value tables (added in F1). If this holds, the facet
 * translator can lower a facet into a single relational `where`. If it fails,
 * the plan falls back to a two-phase async approach.
 */
layer(ProductAttributeLayer, { timeout: 120_000 })('attribute-facet spike', (it) => {
  it.effect('nested cross-module relational where holds for VALUE/SWATCH/NUMERIC facets', () =>
    Effect.gen(function* () {
      yield* truncateProductAttribute
      const db = yield* DrizzleDb

      // ── seed: product type ───────────────────────────────────────────────
      const type = (yield* db
        .insert(productSchema.productTypes)
        .values({ organizationId: null, name: 'spike-type', slug: 'spike-type', isShippingRequired: true })
        .returning())[0]!

      // ── seed: attribute `color` (DROPDOWN, filterable) with VALUE + SWATCH ─
      const color = (yield* db
        .insert(attributeSchema.attributes)
        .values({ organizationId: null, name: 'color', slug: 'color', type: 'DROPDOWN', isFilterable: true })
        .returning())[0]!
      const redValue = (yield* db
        .insert(attributeSchema.attributeValues)
        .values({ attributeId: color.id, organizationId: null, slug: 'red', value: 'Red' })
        .returning())[0]!
      // ── seed: attribute `finish` (SWATCH, filterable) with a SWATCH `blue` ─
      // (the kind now derives from the attribute's `type`, so a swatch value
      // must belong to a SWATCH attribute — not a DROPDOWN one.)
      const finish = (yield* db
        .insert(attributeSchema.attributes)
        .values({ organizationId: null, name: 'finish', slug: 'finish', type: 'SWATCH', isFilterable: true })
        .returning())[0]!
      const blueSwatch = (yield* db
        .insert(attributeSchema.attributeSwatchValues)
        .values({ attributeId: finish.id, organizationId: null, slug: 'blue', value: 'Blue', color: '#0000ff' })
        .returning())[0]!

      // ── seed: attribute `weight` (NUMERIC, filterable) with a NUMERIC value 60 ─
      const weight = (yield* db
        .insert(attributeSchema.attributes)
        .values({ organizationId: null, name: 'weight', slug: 'weight', type: 'NUMERIC', isFilterable: true })
        .returning())[0]!
      const weight60 = (yield* db
        .insert(attributeSchema.attributeNumericValues)
        .values({ attributeId: weight.id, organizationId: null, value: 60 })
        .returning())[0]!

      // ── seed: products ────────────────────────────────────────────────────
      const mkProduct = (handle: string) =>
        db
          .insert(productSchema.products)
          .values({ organizationId: null, productTypeId: type.id, handle, name: handle })
          .returning()
      const pRedHeavy = (yield* mkProduct('p-red-heavy'))[0]!
      const pRedOnly = (yield* mkProduct('p-red-only'))[0]!
      const pBlue = (yield* mkProduct('p-blue'))[0]!

      // ── seed: product_attribute_values pivots ─────────────────────────────
      yield* db.insert(productSchema.productAttributeValues).values([
        // p-red-heavy: color=red VALUE + weight=60 NUMERIC
        { productId: pRedHeavy.id, organizationId: null, attributeId: color.id, valueId: redValue.id, position: 0 },
        { productId: pRedHeavy.id, organizationId: null, attributeId: weight.id, valueId: weight60.id, position: 0 },
        // p-red-only: color=red VALUE
        { productId: pRedOnly.id, organizationId: null, attributeId: color.id, valueId: redValue.id, position: 0 },
        // p-blue: finish=blue SWATCH
        { productId: pBlue.id, organizationId: null, attributeId: finish.id, valueId: blueSwatch.id, position: 0 },
      ])

      const handles = (rows: ReadonlyArray<any>) => rows.map(r => r.handle as string).sort()

      // ── 1. nested cross-module relational where (numeric range) ───────────
      const numericRange = yield* db.query.products!.findMany({
        where: {
          attributeValues: {
            attribute: { isFilterable: true, type: 'NUMERIC' },
            numericValue: { value: { gte: 50 } },
          },
        } as any,
      })
      expect(handles(numericRange)).toEqual(['p-red-heavy'])

      // ── 2. facet AND across two exists on the same relation ───────────────
      const facetAnd = yield* db.query.products!.findMany({
        where: {
          AND: [
            { attributeValues: { attribute: { type: 'DROPDOWN' }, selectValue: { slug: { eq: 'red' } } } },
            { attributeValues: { attribute: { type: 'NUMERIC' }, numericValue: { value: { gte: 50 } } } },
          ],
        } as any,
      })
      expect(handles(facetAnd)).toEqual(['p-red-heavy'])

      // ── 3. slug OR across select (DROPDOWN) + SWATCH, disambiguated by type ─
      const slugOr = yield* db.query.products!.findMany({
        where: {
          attributeValues: {
            OR: [
              { attribute: { type: { in: ['DROPDOWN', 'MULTISELECT'] } }, selectValue: { slug: { in: ['red'] } } },
              { attribute: { type: 'SWATCH' }, swatchValue: { slug: { in: ['blue'] } } },
            ],
          },
        } as any,
      })
      expect(handles(slugOr)).toEqual(['p-blue', 'p-red-heavy', 'p-red-only'])
    }))
})
