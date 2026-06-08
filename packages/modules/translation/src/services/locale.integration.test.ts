import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makePostgresTestLayer, truncateTables } from '@czo/kit/testing'
import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { translationRelations } from '../database/relations'
import { locales } from '../database/schema'
import * as Locale from './locale'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations')
const LocalePostgresLayer = makePostgresTestLayer({
  migrationsFolder: MIGRATIONS,
  relations: translationRelations({ locales }),
})
const truncateLocales = truncateTables(locales)

const TestLayer = Locale.layer('en').pipe(Layer.provideMerge(LocalePostgresLayer))

layer(TestLayer, { timeout: 120_000 })('LocaleService', (it) => {
  it.effect('seed inserts en; createLocale + findByCode round-trips; duplicate code fails', () =>
    Effect.gen(function* () {
      const svc = yield* Locale.LocaleService
      const en = yield* svc.findLocaleByCode('en')
      expect(en?.code).toBe('en')
      const fr = yield* svc.createLocale({ code: 'fr', name: 'Francais' })
      expect(fr.code).toBe('fr')
      const dup = yield* svc.createLocale({ code: 'fr', name: 'Frenchy' }).pipe(Effect.flip)
      expect(dup._tag).toBe('LocaleCodeTaken')
    }))

  it.effect('listLocales activeOnly filters inactive; updateLocale optimistic lock', () =>
    Effect.gen(function* () {
      yield* truncateLocales
      const svc = yield* Locale.LocaleService
      yield* svc.createLocale({ code: 'en', name: 'English' })
      const de = yield* svc.createLocale({ code: 'de', name: 'German', isActive: false })
      const active = yield* svc.listLocales({ activeOnly: true })
      expect(active.map(l => l.code).sort()).toEqual(['en'])
      const all = yield* svc.listLocales({})
      expect(all.length).toBe(2)
      const err = yield* svc.updateLocale(de.id, de.version + 5, { name: 'Deutsch' }).pipe(Effect.flip)
      expect(err.name).toBe('OptimisticLockError')
    }))

  it.effect('getDefaultLocale resolves the configured code (en) or null', () =>
    Effect.gen(function* () {
      yield* truncateLocales
      const svc = yield* Locale.LocaleService
      const none = yield* svc.getDefaultLocale()
      expect(none).toBe(null)
      yield* svc.createLocale({ code: 'en', name: 'English' })
      const def = yield* svc.getDefaultLocale()
      expect(def?.code).toBe('en')
    }))
})
