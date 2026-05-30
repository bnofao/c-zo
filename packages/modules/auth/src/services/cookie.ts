import { Config, Context, Data, Duration, Effect, Layer } from 'effect'
import { SESSION_DURATION } from '../constants'

/** Cookie attributes — `name` is intentionally NOT here (see `Cookie`). */
export interface CookieAttributes {
  readonly httpOnly: boolean
  readonly sameSite: 'lax' | 'strict' | 'none'
  readonly secure: boolean
  readonly path: string
  readonly domain?: string
  readonly maxAge: number
  readonly expires?: Date
}

/**
 * A cookie value object — `Data.Class` (structural equality) with a
 * `serialize()` method that renders the `Set-Cookie` header value.
 * `name` is a top-level field, not an attribute.
 */
export class Cookie extends Data.Class<{
  readonly name: string
  readonly value: string
  readonly attributes: CookieAttributes
}> {
  /** Render this cookie as a `Set-Cookie` header value. */
  serialize(): string {
    const a = this.attributes
    const parts = [`${this.name}=${encodeURIComponent(this.value)}`]
    parts.push(`Max-Age=${Math.trunc(a.maxAge)}`)
    if (a.expires)
      parts.push(`Expires=${a.expires.toUTCString()}`)
    if (a.domain)
      parts.push(`Domain=${a.domain}`)
    parts.push(`Path=${a.path}`)
    if (a.httpOnly)
      parts.push('HttpOnly')
    if (a.secure)
      parts.push('Secure')
    parts.push(`SameSite=${a.sameSite[0]!.toUpperCase()}${a.sameSite.slice(1)}`)
    return parts.join('; ')
  }
}

export interface CookieConfig {
  readonly name: string
  readonly attributes: CookieAttributes
}

/**
 * Generic, config-driven cookie mechanics for ONE configured cookie.
 * Pure: no I/O, no session knowledge.
 */
export class CookieService extends Context.Service<CookieService, {
  /** The configured cookie name — exposed so callers needn't synthesize a `Cookie` to read it. */
  readonly name: string
  readonly create: (value: string) => Cookie
  readonly createBlank: () => Cookie
  readonly parse: (header: string) => Record<string, string>
}>()('@czo/auth/CookieService') {}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1)
      continue
    const key = part.slice(0, eq).trim()
    if (!key)
      continue
    out[key] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

function make(config: CookieConfig) {
  return CookieService.of({
    name: config.name,
    create: value => new Cookie({ name: config.name, value, attributes: config.attributes }),
    createBlank: () => new Cookie({
      name: config.name,
      value: '',
      attributes: { ...config.attributes, maxAge: 0, expires: new Date(0) },
    }),
    parse: parseCookieHeader,
  })
}

/** Layer factory — parametrised by a resolved `CookieConfig`. */
export function layer(config: CookieConfig): Layer.Layer<CookieService> {
  return Layer.succeed(CookieService, make(config))
}

/**
 * Layer factory reading the cookie config from Effect `Config` — each field is
 * individually wrappable as a `Config` (e.g. `name` / `sameSite` / `maxAge`
 * sourced from env vars). Fails with `ConfigError` if a required key is absent.
 */
export function layerConfig(config: Config.Wrap<CookieConfig>): Layer.Layer<CookieService, Config.ConfigError> {
  return Layer.effect(CookieService, Config.unwrap(config).pipe(Effect.map(make)))
}

/**
 * The cookie configuration as a `Config.Wrap` — one `Config` per field, with
 * camelCase object keys matching `CookieConfig` exactly, so this object IS a
 * `Config.Wrap<CookieConfig>` and can be handed straight to `layerConfig`.
 * Each leaf `Config` is *named* in camelCase too (`sessionCookieName`,
 * `sessionCookieHttpOnly`, …); a `ConfigProvider.constantCase` wrapper — wired
 * in a later step — maps those onto the conventional `SESSION_COOKIE_*` env
 * vars. `name`/`httpOnly`/`sameSite`/`secure`/`path` are env-backed and
 * defaulted (a bare environment still boots). `maxAge` is deliberately NOT
 * env-tunable — it is pinned to the shared `SESSION_DURATION`, converted to
 * whole seconds via `Duration.toSeconds` for the `Set-Cookie` `Max-Age`, so the
 * cookie lifetime and the DB session `expiresAt` (Task 5) cannot drift.
 * `domain` is omitted (use `layer`/`layerConfig` for that rare case).
 */
// Intentionally NOT annotated as `Config.Wrap<CookieConfig>` — the explicit
// union annotation causes `typeof cookieConfig` (used as the CookieConfigService
// shape) to become a union including `Config<CookieConfig>`, which breaks the
// `Layer.succeed` call. Letting TypeScript infer the concrete structural type
// preserves the `Config.Wrap` structural contract without the union issue.
const cookieConfig = {
  name: Config.string('sessionCookieName').pipe(Config.withDefault('czo.session')),
  attributes: {
    httpOnly: Config.boolean('sessionCookieHttpOnly').pipe(Config.withDefault(true)),
    sameSite: Config.literals(['lax', 'strict', 'none'], 'sessionCookieSameSite')
      .pipe(Config.withDefault('lax' as const)),
    secure: Config.boolean('sessionCookieSecure').pipe(Config.withDefault(false)),
    path: Config.string('sessionCookiePath').pipe(Config.withDefault('/')),
    maxAge: Config.succeed(Duration.toSeconds(SESSION_DURATION)),
  },
}

/**
 * The cookie `Config.Wrap` as an injectable service — its shape is declared as
 * `typeof cookieConfig`. The layer lives directly on the class and is a plain
 * `Layer.succeed`: it carries the static bag of `Config`s — nothing is read
 * from the environment here; resolution happens downstream in `layerConfig`.
 */
export class CookieConfigService extends Context.Service<CookieConfigService, typeof cookieConfig>()(
  '@czo/auth/CookieConfigService',
) {
  /** Internal layer — the static `Config.Wrap`; no env access at construction. */
  static readonly layer: Layer.Layer<CookieConfigService> = Layer.succeed(
    CookieConfigService,
    CookieConfigService.of(cookieConfig),
  )
}

/**
 * Layer for `CookieService` routed through `CookieConfigService`. It reads the
 * service's `Config.Wrap` and feeds it to `layerConfig` — so the env
 * resolution and the `ConfigError` come from the exact same path as a direct
 * `layerConfig` call. `CookieConfigService.layer` is provided internally, so
 * only a possible `ConfigError` is left in `E`.
 */
export const layerConfigService: Layer.Layer<CookieService, Config.ConfigError> = Layer.unwrap(
  CookieConfigService.pipe(Effect.map(layerConfig)),
).pipe(Layer.provide(CookieConfigService.layer))
