/**
 * `@czo/translation` module — defines the translation `CzoModule`, wiring the
 * locale registry into the app manifest.
 *
 * `TRANSLATION_DEFAULT_LOCALE` is read from the environment via Effect `Config`
 * at boot and threaded into `Locale.layer(code)` via `Layer.unwrap`. The host
 * manifest lists this module after `@czo/auth` (which provides `AccessService`).
 */
import type { Layer as LayerT } from 'effect'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { registerTranslationSchema } from '@czo/translation/graphql'
import { translationRelations } from '@czo/translation/relations'
import * as translationSchema from '@czo/translation/schema'
import { Locale } from '@czo/translation/services'
import { Config, Effect, Layer } from 'effect'

const LOCALE_STATEMENTS = { locale: ['create', 'read', 'update', 'delete'] } as const

const LOCALE_HIERARCHY: Access.HierarchyLevel<typeof LOCALE_STATEMENTS>[] = [
  { name: 'locale:viewer', permissions: { locale: ['read'] } },
  { name: 'locale:manager', permissions: { locale: ['create', 'update'] } },
  { name: 'locale:admin', permissions: { locale: ['delete'] } },
]

export default defineModule(() => {
  const translationConfig = Effect.gen(function* () {
    const defaultLocaleCode = yield* Config.string('TRANSLATION_DEFAULT_LOCALE').pipe(Config.withDefault('en'))
    return { defaultLocaleCode }
  })

  // `Layer.unwrap` bridges runtime Config reading to build-time layer composition,
  // same convention as auth's AuthModuleLive.
  const TranslationModuleLive = Layer.unwrap(
    translationConfig.pipe(Effect.map(cfg => Locale.layer(cfg.defaultLocaleCode))),
  )

  return {
    name: 'translation',
    version: '0.0.1',
    layer: TranslationModuleLive as unknown as LayerT.Layer<never, never, never>,
    db: {
      schema: translationSchema as unknown as Record<string, unknown>,
      relations: translationRelations,
    },
    graphql: {
      contribution: builder => registerTranslationSchema(builder as never),
    },
    onStart: Effect.gen(function* () {
      const access = yield* Access.AccessService
      yield* access.register({
        name: 'locale',
        statements: LOCALE_STATEMENTS,
        hierarchy: LOCALE_HIERARCHY,
      })
    }) as unknown as Effect.Effect<void, never, never>,
  }
})
