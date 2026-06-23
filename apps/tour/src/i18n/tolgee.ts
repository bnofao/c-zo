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
export function createTolgee(language: string, inContext = false) {
  // The in-context observer (DevTools) injects invisible key-markers into
  // translated text. If they were present on the server HTML or the first client
  // render they'd break hydration — so both build a plain instance, and the root
  // upgrades to the in-context instance only AFTER hydration (see __root.tsx).
  // `import.meta.env.DEV` is a static guard so the API key never ships to prod.
  const dev = inContext && import.meta.env.DEV

  let tolgee = Tolgee().use(FormatSimple())

  if (dev)
    tolgee = tolgee.use(DevTools())

  return tolgee.init({
    language,
    availableLanguages: [...LOCALES],
    defaultLanguage: 'en',
    fallbackLanguage: 'en',
    staticData: { 'en': en, 'fr-FR': frFR },
    apiUrl: dev ? import.meta.env.VITE_TOLGEE_API_URL : undefined,
    apiKey: dev ? import.meta.env.VITE_TOLGEE_API_KEY : undefined,
  })
}
