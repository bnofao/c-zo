import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { ProductPostgresLayer, truncateProduct } from '../testing/postgres'
import * as Adoption from './adoption'
import * as Prod from './product'
import * as ProductType from './product-type'

const TestLayer = Adoption.AdoptionServiceLive.pipe(
  Layer.provideMerge(Prod.ProductServiceLive),
  Layer.provideMerge(ProductType.ProductTypeServiceLive),
  Layer.provideMerge(ProductPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('AdoptionService', (it) => {
  // ─── helpers ─────────────────────────────────────────────────────────────

  const makeGlobalType = (slug = 'shirt') =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: null, name: slug, slug, isShippingRequired: true })
    })

  const makeOrgType = (orgId: number, slug = 'shirt') =>
    Effect.gen(function* () {
      const svc = yield* ProductType.ProductTypeService
      return yield* svc.createType({ organizationId: orgId, name: slug, slug, isShippingRequired: true })
    })

  const makeGlobalProduct = (handle = 'global-p') =>
    Effect.gen(function* () {
      const t = yield* makeGlobalType(handle)
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct({ organizationId: null, productTypeId: t.id, handle, name: handle })
    })

  const makeOrgProduct = (orgId: number, handle = 'org-p') =>
    Effect.gen(function* () {
      const t = yield* makeOrgType(orgId, handle)
      const svc = yield* Prod.ProductService
      return yield* svc.createProduct({ organizationId: orgId, productTypeId: t.id, handle, name: handle })
    })

  // ─── adoptProduct ─────────────────────────────────────────────────────────

  it.effect('adopt a global product → row created; isAdopted → true', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      const adoption = yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      expect(adoption.productId).toBe(p.id)
      expect(adoption.organizationId).toBe(1)
      expect(adoption.deletedAt).toBeNull()
      const adopted = yield* svc.isAdopted({ productId: p.id, orgId: 1 })
      expect(adopted).toBe(true)
    }))

  it.effect('adopt an org-owned product → CannotAdoptOwnedProduct', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeOrgProduct(1)
      const svc = yield* Adoption.AdoptionService
      const err = yield* svc.adoptProduct({ productId: p.id, orgId: 2 }).pipe(Effect.flip)
      expect(err._tag).toBe('CannotAdoptOwnedProduct')
    }))

  it.effect('adopt a non-existent product → ProductNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const svc = yield* Adoption.AdoptionService
      const err = yield* svc.adoptProduct({ productId: 999999, orgId: 1 }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotFound')
    }))

  it.effect('double adopt → idempotent (no error, still one live row)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      const adopters = yield* svc.listAdopters(p.id)
      expect(adopters.length).toBe(1)
      expect(adopters[0]).toBe(1)
    }))

  // ─── isAdopted ────────────────────────────────────────────────────────────

  it.effect('isAdopted false for org that never adopted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      const adopted = yield* svc.isAdopted({ productId: p.id, orgId: 99 })
      expect(adopted).toBe(false)
    }))

  it.effect('isAdopted false for org-2 when only org-1 adopted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      const adopted2 = yield* svc.isAdopted({ productId: p.id, orgId: 2 })
      expect(adopted2).toBe(false)
    }))

  // ─── unadoptProduct ───────────────────────────────────────────────────────

  it.effect('unadopt → isAdopted false afterward', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.unadoptProduct({ productId: p.id, orgId: 1 })
      const adopted = yield* svc.isAdopted({ productId: p.id, orgId: 1 })
      expect(adopted).toBe(false)
    }))

  it.effect('re-adopt after unadopt → OK (isAdopted true again)', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.unadoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      const adopted = yield* svc.isAdopted({ productId: p.id, orgId: 1 })
      expect(adopted).toBe(true)
    }))

  it.effect('unadopt when not adopted → AdoptionNotFound', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      const err = yield* svc.unadoptProduct({ productId: p.id, orgId: 1 }).pipe(Effect.flip)
      expect(err._tag).toBe('AdoptionNotFound')
    }))

  // ─── requireAdopted ───────────────────────────────────────────────────────

  it.effect('requireAdopted: succeeds when adopted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.requireAdopted({ productId: p.id, orgId: 1 })
      // no error thrown — test passes implicitly
    }))

  it.effect('requireAdopted: fails ProductNotAdopted when not adopted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService
      const err = yield* svc.requireAdopted({ productId: p.id, orgId: 1 }).pipe(Effect.flip)
      expect(err._tag).toBe('ProductNotAdopted')
    }))

  // ─── listAdoptedProducts ──────────────────────────────────────────────────

  it.effect('listAdoptedProducts: only this org live-adopted globals (not org-owned, not others\')', () =>
    Effect.gen(function* () {
      yield* truncateProduct

      // Global product adopted by org-1
      const global1 = yield* makeGlobalProduct('global-1')
      // Global product adopted by org-2 only
      const global2 = yield* makeGlobalProduct('global-2')
      // Org-1-owned product (not adoptable)
      const orgOwned = yield* makeOrgProduct(1, 'org-owned')

      const svc = yield* Adoption.AdoptionService
      yield* svc.adoptProduct({ productId: global1.id, orgId: 1 })
      yield* svc.adoptProduct({ productId: global2.id, orgId: 2 })

      const list = yield* svc.listAdoptedProducts(1)
      const ids = list.map(p => p.id)
      expect(ids).toContain(global1.id)
      expect(ids).not.toContain(global2.id)
      expect(ids).not.toContain(orgOwned.id)
    }))

  // ─── findProducts via the adoption relational filter (connection backing) ───

  it.effect('findProducts({ adoptions: { organizationId } }): only this org\'s adopted globals', () =>
    Effect.gen(function* () {
      yield* truncateProduct

      const adopted = yield* makeGlobalProduct('adopted-g')
      const unadopted = yield* makeGlobalProduct('unadopted-g')

      const adoptionSvc = yield* Adoption.AdoptionService
      yield* adoptionSvc.adoptProduct({ productId: adopted.id, orgId: 1 })

      const prodSvc = yield* Prod.ProductService
      const rows = yield* prodSvc.findProducts({
        where: { adoptions: { organizationId: 1, deletedAt: { isNull: true } } } as any,
      })
      const ids = rows.map(p => p.id)
      expect(ids).toContain(adopted.id)
      expect(ids).not.toContain(unadopted.id)
    }))

  it.effect('findProducts adoption filter: excludes after unadopt', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct('readopt-g')
      const adoptionSvc = yield* Adoption.AdoptionService
      yield* adoptionSvc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* adoptionSvc.unadoptProduct({ productId: p.id, orgId: 1 })

      const prodSvc = yield* Prod.ProductService
      const rows = yield* prodSvc.findProducts({
        where: { adoptions: { organizationId: 1, deletedAt: { isNull: true } } } as any,
      })
      expect(rows.map(p => p.id)).not.toContain(p.id)
    }))

  // ─── listAdopters ─────────────────────────────────────────────────────────

  it.effect('listAdopters: org ids with live adoption; excludes unadopted', () =>
    Effect.gen(function* () {
      yield* truncateProduct
      const p = yield* makeGlobalProduct()
      const svc = yield* Adoption.AdoptionService

      yield* svc.adoptProduct({ productId: p.id, orgId: 1 })
      yield* svc.adoptProduct({ productId: p.id, orgId: 2 })
      yield* svc.adoptProduct({ productId: p.id, orgId: 3 })
      yield* svc.unadoptProduct({ productId: p.id, orgId: 2 })

      const adopters = yield* svc.listAdopters(p.id)
      expect(adopters).toContain(1)
      expect(adopters).not.toContain(2)
      expect(adopters).toContain(3)
      expect(adopters.length).toBe(2)
    }))
})
