import type { EmailService } from '@czo/kit/email'
/**
 * @czo/auth module — defines the auth `CzoModule` contract, replacing
 * the legacy Nitro plugin wiring (`plugins/index.ts`).
 *
 * Because auth's Layer construction depends on app-level config (secret,
 * socials, storage), we expose a factory `makeAuthModule(config)` rather
 * than a static module value. The host application calls the factory in
 * `apps/<app>/modules.ts` with the resolved config and passes the result
 * to `composeApp([...])`.
 *
 * The Nitro module def (HTTP route registration for `/api/auth/**`) stays
 * in `nitro-module.ts` for now — phase 3 will move route registration into
 * the CzoModule contract via an `httpApi` slot or equivalent.
 */
import type { CzoModule } from '@czo/kit/module'
import type { SocialProviders } from 'better-auth/social-providers'
import type { Duration } from 'effect'
import { authScopes, registerAuthSchema } from '@czo/auth/graphql'
import { makeBetterAuthLive } from '@czo/auth/layers'
import { authRelations } from '@czo/auth/relations'
import * as authSchema from '@czo/auth/schema'
import { Access, Actor, ApiKey, BetterAuth, Organization, OrganizationEvents, User, UserEvents } from '@czo/auth/services'
import * as Email from '@czo/kit/email'
import { defineModule } from '@czo/kit/module'
import { Effect, Layer } from 'effect'
import { defineHandler } from 'h3'
import { makeSessionContextContributor } from './graphql/session-context'
import { signInHandler } from './http/sign-in'
import { signOutHandler } from './http/sign-out'
import { signUpHandler } from './http/sign-up'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  API_KEY_HIERARCHY,
  API_KEY_STATEMENTS,
  APPS_HIERARCHY,
  APPS_STATEMENTS,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
} from './plugins/access'
import { DEFAULT_ACTOR_RESTRICTIONS } from './plugins/actor'
import * as Account from './services/account'
import * as Cookie from './services/cookie'
import * as AuthEvents from './services/events/auth'
import * as Impersonation from './services/impersonation'
import * as Password from './services/password'
import * as Session from './services/session'
// `Storage` from unstorage isn't a direct dep of @czo/auth — kept as
// an unknown structural placeholder so the host app can pass through
// whatever storage shape `better-auth` expects without coupling us to
// unstorage. The factory just forwards it.
type Storage = unknown

export interface AuthModuleConfig {
  /** App identifier used as the better-auth cookie prefix. */
  readonly app: string
  /** Secret for sessions/cookies — must be ≥ 32 chars. */
  readonly secret: string
  /** Base URL of the app (used for OAuth callbacks). */
  readonly baseUrl?: string
  /** Social-provider config (Google, GitHub, …). */
  readonly socials?: SocialProviders
  /** unstorage instance for session/state storage. */
  readonly storage?: Storage
  /** Impersonation tunables (Task 6 wires the live config). */
  readonly impersonation?: {
    readonly defaultTtl?: Duration.Duration
    readonly maxTtl?: Duration.Duration
    readonly allowImpersonateAdmin?: boolean
  }
  /** Gate sign-in on user.emailVerified. Default false. */
  readonly requireEmailVerification?: boolean
  /** Auto-send verification email after sign-up. Default true. */
  readonly sendVerificationOnSignUp?: boolean
  /** Account flow tunables. */
  readonly account?: {
    readonly passwordResetTtl?: Duration.Duration // default 1h
    readonly emailVerificationTtl?: Duration.Duration // default 24h
  }
  /** Override the default LoggingEmailLive (dev stub). */
  readonly email?: {
    readonly layer?: Layer.Layer<EmailService>
    readonly from?: string
  }
}

const DB_SEEDERS = [
  {
    name: 'users',
    config: {
      refine: (f: any) => ({
        count: 5,
        columns: {
          name: f.fullName(),
          email: f.email(),
          role: f.valuesFromArray({ values: ['admin', 'user'] }),
        },
      }),
    },
  },
  {
    name: 'organizations',
    config: {
      refine: (f: any) => ({
        count: 3,
        columns: {
          name: f.companyName(),
          slug: f.string({ isUnique: true }),
        },
      }),
    },
  },
  {
    name: 'apps',
    config: {
      dependsOn: ['users', 'organizations'],
      refine: (f: any) => ({
        count: 10,
        columns: {
          appId: f.string({ isUnique: true }),
          status: f.valuesFromArray({ values: ['active', 'disabled'] }),
          manifest: f.default({
            defaultValue: {
              id: 'seed-app',
              name: 'Seed App',
              version: '1.0.0',
              appUrl: 'https://seed.example.com',
              register: 'https://seed.example.com/register',
              scope: 'organization',
              permissions: { products: ['read'] },
              webhooks: [],
            },
          }),
          webhookSecret: f.default({ defaultValue: '' }),
        },
      }),
    },
  },
] as const

/**
 * Construct the auth `CzoModule`. The Layer wires `AccessService`,
 * `BetterAuth`, and the four domain services (User, Organization,
 * ApiKey, AuthActor) with their event buses. `onStart` freezes the
 * access registry after all modules have registered their domains.
 */
export function makeAuthModule(config: AuthModuleConfig): CzoModule<'auth', never> {
// Seed AccessServiceLive with auth's 4 domains, but DON'T freeze yet —
  // external modules (stock-location, etc.) extend the registry from
  // their own `composeApp.startup`. We freeze in our own `onStart`,
  // which runs after all module startups.
  const accessOptions = [
    { name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY },
    { name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY },
    { name: 'api-key', statements: API_KEY_STATEMENTS, hierarchy: API_KEY_HIERARCHY },
    { name: 'apps', statements: APPS_STATEMENTS, hierarchy: APPS_HIERARCHY },
  ] as const
  const AccessServiceLive = Access.makeLayer(accessOptions as never, false)

  const BetterAuthLive = makeBetterAuthLive({
    app: config.app,
    secret: config.secret,
    baseUrl: config.baseUrl,
    socials: config.socials,
    storage: config.storage as never,
    requireEmailVerification: config.requireEmailVerification,
  })

  const UserServiceLive = User.layer
  const OrganizationServiceLive = Organization.layer
  // AuthActorService's registry is closed at construction — no post-boot
  // extension path. Eager freeze keeps the invariant honest.
  const AuthActorServiceLive = Actor.makeLayer(DEFAULT_ACTOR_RESTRICTIONS, true)

  // CookieService config — `Cookie.layerConfigService` builds CookieService
  // from the env-backed `Config.Wrap` routed through `CookieConfigService`.
  // All cookie tuning now lives in `services/cookie.ts`.
  const cookieLayer = Cookie.layerConfigService

  // SessionService requires DrizzleDb + Persistence — shared infra provided at
  // the app surface by buildApp (deferred, see Notes). CookieService is
  // module-local, provided here (`layerConfigService`'s `ConfigError` is
  // absorbed by the `AuthModuleLive` cast).
  const sessionLayer = Session.layer.pipe(Layer.provide(cookieLayer))

  const ImpersonationConfigLive = Impersonation.makeImpersonationConfigLayer(config.impersonation)

  const baseUrl = config.baseUrl
  if (!baseUrl)
    throw new Error('AuthModuleConfig.baseUrl is required (SP5 account flows need it for email URLs)')

  const AccountConfigLive = Account.makeAccountConfigLayer({
    baseUrl,
    requireEmailVerification: config.requireEmailVerification,
    sendVerificationOnSignUp: config.sendVerificationOnSignUp,
    passwordResetTtl: config.account?.passwordResetTtl,
    emailVerificationTtl: config.account?.emailVerificationTtl,
  })

  const EmailLive = config.email?.layer ?? Email.loggingLayer

  const AuthModuleLive = Layer.mergeAll(
    ApiKey.layer.pipe(
      Layer.provideMerge(OrganizationServiceLive.pipe(Layer.provideMerge(OrganizationEvents.layer))),
    ),
    UserServiceLive,
    AuthActorServiceLive,
    Password.layer,
    AuthEvents.layer,
    sessionLayer,
    // Subscribers fiber bridging UserEvents → SessionService.revokeAllForUser /
    // invalidateCacheForUser. Forked into the layer's Scope; dies on runtime
    // disposal.
    Session.subscribersLayer,
    Impersonation.layer,
    Account.layer,
    Account.subscribersLayer,
  ).pipe(
    // Factor `UserEvents.layer` out so both `UserServiceLive` (publisher) and
    // `Session.subscribersLayer` (consumer) share the same `PubSub` instance.
    Layer.provideMerge(UserEvents.layer),
    // `provideMerge` so `BetterAuth` and `AccessService` stay visible at
    // the runtime surface — request-time consumers reach them via
    // `runEffect(rt, BetterAuth)` without composing an inner runtime.
    Layer.provideMerge(BetterAuthLive),
    Layer.provideMerge(AccessServiceLive),
    Layer.provideMerge(ImpersonationConfigLive),
    Layer.provideMerge(AccountConfigLive),
    Layer.provideMerge(EmailLive),
  )

  return defineModule({
    name: 'auth',
    version: '0.1.0',
    layer: AuthModuleLive as unknown as Layer.Layer<never, never, never>,
    db: {
      schema: authSchema as unknown as Record<string, unknown>,
      relations: authRelations,
      seeders: DB_SEEDERS as never,
    },
    graphql: {
      contribution: builder => registerAuthSchema(builder),
      authScope: authScopes,
      contexts: makeSessionContextContributor(),
    },
    http: (app) => {
      app.post('/api/auth/sign-up', signUpHandler)
      app.post('/api/auth/sign-in', signInHandler)
      app.post('/api/auth/sign-out', signOutHandler)
      // Mount better-auth's catch-all on `/api/auth/**`. The handler
      // pulls `BetterAuth` per-request via `event.context.runEffect`
      // (injected by the kit) — singleton lookup is cheap and avoids
      // closing over a runtime ref at module-load time.
      app.all('/api/auth/**', defineHandler(async (event) => {
        const auth = await event.context.runEffect(BetterAuth)
        return auth.handler(event.req)
      }))
      return Effect.void
    },
    onStart: Effect.gen(function* () {
      const access = yield* Access.AccessService
      yield* access.freeze
      // Warm OrganizationService so a broken Layer composition fails at
      // boot rather than at first request.
      yield* Organization.OrganizationService
    }) as unknown as Effect.Effect<void, never, never>,
  })
}
