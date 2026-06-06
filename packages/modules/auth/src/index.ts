/**
 * @czo/auth module — defines the auth `CzoModule` contract, replacing
 * the legacy Nitro plugin wiring (`plugins/index.ts`).
 *
 * Host config (secret, app id, base URL) is read from the environment via
 * Effect `Config` inside the module, so there's no `makeAuthModule(config)`
 * factory and no config threaded through Nitro runtimeConfig — the app just
 * lists this default export in `apps/<app>/modules.ts`.
 *
 * The HTTP route registration for `/api/auth/**` lives in the `http` slot
 * below; phase 3 will formalize it once Nitro is dropped.
 */
import { authScopes, registerAuthSchema } from '@czo/auth/graphql'
import { authRelations } from '@czo/auth/relations'
import * as authSchema from '@czo/auth/schema'
import { Access, Actor, ApiKey, ApiKeyEvents, Organization, OrganizationEvents, User, UserEvents } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { Config, Duration, Effect, Layer } from 'effect'
import { makeSessionContextContributor } from './graphql/session-context'
import { authRoutes } from './http/routes'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  API_KEY_HIERARCHY,
  API_KEY_STATEMENTS,
  APPS_HIERARCHY,
  APPS_STATEMENTS,
  makeOrganizationHierarchy,
  ORGANIZATION_STATEMENTS,
} from './plugins/access'
import { DEFAULT_ACTOR_RESTRICTIONS } from './plugins/actor'
import * as Account from './services/account'
import * as Cookie from './services/cookie'
import * as AuthEvents from './services/events/auth'
import * as Impersonation from './services/impersonation'
import * as Password from './services/password'
import * as Session from './services/session'

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
 * Construct the auth `CzoModule`. The Layer wires `AccessService` and
 * the four domain services (User, Organization, ApiKey, AuthActor) with
 * their event buses. `onStart` freezes the access registry after all
 * modules have registered their domains.
 */
export default defineModule(() => {
  // Host config read from the environment via Effect `Config`. Replaces the
  // old `makeAuthModule(config)` parameter — secret/app/baseUrl are no longer
  // threaded through Nitro runtimeConfig. Keys map to the matching
  // `process.env` entries via the default ConfigProvider.
  const authConfig = Effect.gen(function* () {
    const app = yield* Config.string('AUTH_APP').pipe(Config.withDefault('czo'))
    const secret = yield* Config.string('AUTH_SECRET')
    const baseUrl = yield* Config.string('BASE_URL').pipe(Config.withDefault('http://localhost:4000'))
    const requireEmailVerification = yield* Config.boolean('AUTH_REQUIRE_EMAIL_VERIFICATION').pipe(Config.withDefault(false))
    const sendVerificationOnSignUp = yield* Config.boolean('AUTH_SEND_VERIFICATION_ON_SIGN_UP').pipe(Config.withDefault(true))
    // The org-owner role name: names the top hierarchy level, is granted to org
    // creators, and is matched by the sole-owner guards. Single source of truth.
    const orgOwnerRole = yield* Config.string('AUTH_ORG_OWNER_ROLE').pipe(Config.withDefault('org:owner'))
    const enumTimingBudgetMs = yield* Config.int('AUTH_ENUM_TIMING_BUDGET_MS').pipe(Config.withDefault(250))
    return { app, secret, baseUrl, requireEmailVerification, sendVerificationOnSignUp, orgOwnerRole, enumTimingBudgetMs }
  })

  // `Layer.unwrap` bridges runtime (reading Config) to build-time
  // (composing the Layer graph with those values). The `ConfigError` channel
  // is absorbed by the `layer` cast below — same convention as cookie's
  // `layerConfigService`.
  const AuthModuleLive = Layer.unwrap(authConfig.pipe(Effect.map((cfg) => {
    // Seed AccessServiceLive with auth's 4 domains, but DON'T freeze yet —
    // external modules (stock-location, etc.) extend the registry from
    // their own `composeApp.startup`. We freeze in our own `onStart`,
    // which runs after all module startups.
    const accessOptions = [
      { name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: makeOrganizationHierarchy(cfg.orgOwnerRole) },
      { name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY },
      { name: 'api-key', statements: API_KEY_STATEMENTS, hierarchy: API_KEY_HIERARCHY },
      { name: 'apps', statements: APPS_STATEMENTS, hierarchy: APPS_HIERARCHY },
    ] as const
    const AccessServiceLive = Access.makeLayer(accessOptions as never, false)

    const OrganizationServiceLive = Organization.makeLayer(cfg.orgOwnerRole)
    // AuthActorService's registry is closed at construction — no post-boot
    // extension path. Eager freeze keeps the invariant honest.
    const AuthActorServiceLive = Actor.makeLayer(DEFAULT_ACTOR_RESTRICTIONS, true)

    // CookieService config — `Cookie.layerConfigService` builds CookieService
    // from the env-backed `Config.Wrap`; all cookie tuning lives in
    // `services/cookie.ts`. SessionService also requires DrizzleDb +
    // Persistence — shared infra provided at the app surface by composeApp.
    // `provideMerge` (not `provide`) so `CookieService` is ALSO exported to the
    // merged module runtime: the `/api/auth/sign-out` route handler resolves it
    // directly via `event.context.runEffect` (private `provide` → 500).
    const sessionLayer = Session.layer.pipe(Layer.provideMerge(Cookie.layerConfigService))

    const ImpersonationConfigLive = Impersonation.makeImpersonationConfigLayer(undefined)

    const AccountConfigLive = Account.makeAccountConfigLayer({
      baseUrl: cfg.baseUrl,
      requireEmailVerification: cfg.requireEmailVerification,
      sendVerificationOnSignUp: cfg.sendVerificationOnSignUp,
      orgOwnerRole: cfg.orgOwnerRole,
      enumTimingBudget: Duration.millis(cfg.enumTimingBudgetMs),
    })

    return Layer.mergeAll(
      ApiKey.layer.pipe(
        Layer.provideMerge(ApiKeyEvents.layer),
        Layer.provideMerge(OrganizationServiceLive.pipe(Layer.provideMerge(OrganizationEvents.layer))),
      ),

      AuthActorServiceLive,

      Impersonation.layer,
      // Subscribers fiber bridging UserEvents → SessionService.revokeAllForUser /
      // invalidateCacheForUser. Forked into the layer's Scope; dies on runtime
      // disposal.
      Session.subscribersLayer,
      Account.subscribersLayer,
    ).pipe(
      // `Account.layer` is provideMerge'd (not a flat mergeAll sibling) so its
      // `AccountService` output satisfies `Account.subscribersLayer`'s requirement
      // — sibling layers in `mergeAll` don't wire each other.
      Layer.provideMerge(Account.layer),
      Layer.provideMerge(User.layer),
      Layer.provideMerge(sessionLayer),
      // Factor `UserEvents.layer` out so both `User.layer` (publisher) and
      // `Session.subscribersLayer` (consumer) share the same `PubSub` instance.
      Layer.provideMerge(UserEvents.layer),
      // AuthEvents must be shared between `SessionService.lookup` (publisher for
      // ImpersonationStopped on walk-up), `Impersonation.layer` (publisher for
      // start/stop), and `Account.subscribersLayer` (consumer for email-side
      // notifications). Factor it out so the same `PubSub` instance is seen by all.
      Layer.provideMerge(AuthEvents.layer),
      // `provideMerge` so `AccessService` stays visible at the runtime
      // surface — request-time consumers reach it via `runEffect(rt, …)`.
      Layer.provideMerge(AccessServiceLive),
      Layer.provideMerge(ImpersonationConfigLive),
      Layer.provideMerge(AccountConfigLive),
      Layer.provideMerge(Password.layer),
      // EmailService is intentionally NOT provided here — it's an optional
      // dependency probed via `Effect.serviceOption` in account subscribers.
      // The host app may merge a real `EmailService` layer at compose time.
    )
  })))

  return {
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
    // Credential endpoints (sign-up/in/out) are declared as `routes` so they
    // surface in the OpenAPI document; see `./http/routes`.
    routes: authRoutes,
    // Freeze the access registry in `onStarted` — after every module's
    // `onStart` has declared its access domain (e.g. stock-location
    // registers `'stock-location'` in its own `onStart`). Auth's own four
    // domains are seeded in the layer (`Access.makeLayer(..., false)`).
    onStarted: Effect.gen(function* () {
      const access = yield* Access.AccessService
      yield* access.buildRoles
      yield* access.freeze
      // Warm OrganizationService so a broken Layer composition fails at
      // boot rather than at first request.
      yield* Organization.OrganizationService
    }) as unknown as Effect.Effect<void, never, never>,
  }
})
