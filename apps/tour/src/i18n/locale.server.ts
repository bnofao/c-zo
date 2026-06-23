import type { Locale } from './locales'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { LOCALE_COOKIE, readCookie, resolveLocale, serializeLocaleCookie } from './locales'

/**
 * Resolve the active UI locale from the request's `czo_locale` cookie.
 * Defaults to `en` when absent or unrecognized. This is the single seam where
 * an authenticated account's locale preference can later take precedence.
 */
export const getLocale = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Locale> => resolveLocale(readCookie(getRequestHeader('cookie'), LOCALE_COOKIE)),
)

/** Persist the chosen UI locale in the `czo_locale` cookie. */
export const setLocale = createServerFn({ method: 'POST' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<{ locale: Locale }> => {
    const tag = resolveLocale(data.locale)
    setResponseHeader('set-cookie', serializeLocaleCookie(tag))
    return { locale: tag }
  })
