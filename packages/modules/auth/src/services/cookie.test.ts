import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Duration, Effect, Layer } from 'effect'
import { SESSION_DURATION } from '../constants'
import * as Cookie from './cookie'

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

describe('cookieService', () => {
  it.effect('create wraps a value with the configured name + attributes', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).create('token-abc')
      expect(cookie.name).toBe('czo.session')
      expect(cookie.value).toBe('token-abc')
      expect(cookie.attributes.maxAge).toBe(604800)
      expect(cookie.attributes.httpOnly).toBe(true)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('createBlank yields an empty, immediately-expired deletion cookie', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).createBlank()
      expect(cookie.value).toBe('')
      expect(cookie.attributes.maxAge).toBe(0)
      expect(cookie.attributes.expires?.getTime()).toBe(0)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('parse extracts every cookie from a Cookie header', () =>
    Effect.gen(function* () {
      const map = (yield* Cookie.CookieService).parse('a=1; czo.session=tok-xyz; b=2')
      expect(map['czo.session']).toBe('tok-xyz')
      expect(map.a).toBe('1')
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('parse returns an empty record for an empty header', () =>
    Effect.gen(function* () {
      const map = (yield* Cookie.CookieService).parse('')
      expect(Object.keys(map)).toHaveLength(0)
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('serialize renders a Set-Cookie header value', () =>
    Effect.gen(function* () {
      const header = (yield* Cookie.CookieService).create('tok-1').serialize()
      expect(header).toContain('czo.session=tok-1')
      expect(header).toContain('Max-Age=604800')
      expect(header).toContain('Path=/')
      expect(header).toContain('HttpOnly')
      expect(header).toContain('SameSite=Lax')
    }).pipe(Effect.provide(cookieLayer)))

  it.effect('layerConfigService resolves CookieService from a ConfigProvider', () =>
    Effect.gen(function* () {
      const cookie = (yield* Cookie.CookieService).create('tok-cfg')
      expect(cookie.name).toBe('auth.sid') // env-sourced
      expect(cookie.attributes.path).toBe('/') // defaulted — key absent from the provider
      // maxAge is pinned via Config.succeed — the provider cannot change it:
      expect(cookie.attributes.maxAge).toBe(Duration.toSeconds(SESSION_DURATION))
    }).pipe(Effect.provide(
      Cookie.layerConfigService.pipe(Layer.provide(ConfigProvider.layer(
        // camelCase config name — no `constantCase` wrapper applied here yet
        ConfigProvider.fromUnknown({ sessionCookieName: 'auth.sid' }),
      ))),
    )))
})
