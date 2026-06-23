/**
 * Pure, isomorphic locale core shared by the Tolgee factory (client bundle)
 * and the locale server functions. No server or Tolgee imports live here so
 * both sides can depend on it without pulling server-only code into the
 * client bundle.
 */
export const LOCALES = ['en', 'fr-FR'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'czo_locale'

/** Coerce an arbitrary cookie/header value to a supported locale, else default. */
export function resolveLocale(raw: string | undefined): Locale {
  return LOCALES.includes(raw as Locale) ? (raw as Locale) : DEFAULT_LOCALE
}

/** Read one cookie value out of a raw `Cookie:` header string. */
export function readCookie(
  header: string | null | undefined,
  name: string,
): string | undefined {
  if (!header)
    return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name)
      return rest.join('=')
  }
  return undefined
}

/** Build the `Set-Cookie` value persisting the locale for a year. */
export function serializeLocaleCookie(tag: Locale): string {
  return `${LOCALE_COOKIE}=${tag}; Path=/; Max-Age=31536000; SameSite=Lax`
}
