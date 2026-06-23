import { DevTools, FormatSimple, Tolgee } from '@tolgee/react'
import en from './en.json'
import frFR from './fr-FR.json'
import { LOCALES } from './locales'

/**
 * Build the app's Tolgee instance. `staticData` holds both languages as eager
 * imported objects so translations resolve synchronously during SSR (no
 * loading flash) and are bundled for production. In development we additionally
 * enable `DevTools` + the API key for Alt+click in-context editing; with no API
 * key in production both are tree-shaken out by the `import.meta.env.DEV` guard.
 *
 * Note: @tolgee/react v7 removed the separate `ReactPlugin` — React integration
 * is built into `TolgeeProvider` directly; only `FormatSimple` is needed here.
 */
export function createTolgee(language: string) {
  let tolgee = Tolgee().use(FormatSimple())

  if (import.meta.env.DEV)
    tolgee = tolgee.use(DevTools())

  return tolgee.init({
    language,
    availableLanguages: [...LOCALES],
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    staticData: { 'en': en, 'fr-FR': frFR },
    apiUrl: import.meta.env.DEV ? import.meta.env.VITE_TOLGEE_API_URL : undefined,
    apiKey: import.meta.env.DEV ? import.meta.env.VITE_TOLGEE_API_KEY : undefined,
  })
}
