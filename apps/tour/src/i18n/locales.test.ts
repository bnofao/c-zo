import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  readCookie,
  resolveLocale,
  serializeLocaleCookie,
} from './locales'

describe('resolveLocale', () => {
  it('returns the default (en) for undefined', () => {
    expect(resolveLocale(undefined)).toBe('en')
  })
  it('returns the default (en) for an unknown tag', () => {
    expect(resolveLocale('de')).toBe('en')
  })
  it('returns a supported tag verbatim', () => {
    expect(resolveLocale('fr-FR')).toBe('fr-FR')
    expect(resolveLocale('en')).toBe('en')
  })
  it('default_locale is en', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })
})

describe('readCookie', () => {
  it('extracts a named cookie from a header', () => {
    expect(readCookie('a=1; czo_locale=fr-FR; b=2', LOCALE_COOKIE)).toBe('fr-FR')
  })
  it('returns undefined when absent', () => {
    expect(readCookie('a=1; b=2', LOCALE_COOKIE)).toBeUndefined()
  })
  it('returns undefined for a missing header', () => {
    expect(readCookie(undefined, LOCALE_COOKIE)).toBeUndefined()
    expect(readCookie(null, LOCALE_COOKIE)).toBeUndefined()
  })
})

describe('serializeLocaleCookie', () => {
  it('serializes a year-long, root-path, lax cookie', () => {
    expect(serializeLocaleCookie('fr-FR')).toBe(
      'czo_locale=fr-FR; Path=/; Max-Age=31536000; SameSite=Lax',
    )
  })
})
