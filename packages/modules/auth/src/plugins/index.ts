import { authScopes, registerAuthSchema } from '@czo/auth/graphql'
import { ApiKeyServiceLive, AuthServiceLive, makeAccessServiceLive, makeAuthActorServiceLive, makeBetterAuthLive, makeOrganizationServiceLive, makeUserServiceLive, OrganizationEventsLive, UserEventBusLive } from '@czo/auth/layers'
// import { registerAppConsumer, registerWebhookDispatcher } from '@czo/auth/listeners'
import { authRelations } from '@czo/auth/relations'
import * as authSchema from '@czo/auth/schema'
import { useLogger } from '@czo/kit'
import { registerSchema as registerDbSchema, registerRelations, registerSeeder } from '@czo/kit/db'
import { registerEffectLayer } from '@czo/kit/effect'
import { registerAuthScopes, registerSchema as registerGraphQLSchema } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { Layer } from 'effect'
import { definePlugin } from 'nitro'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  API_KEY_HIERARCHY,
  API_KEY_STATEMENTS,
  APPS_HIERARCHY,
  APPS_STATEMENTS,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
} from './access'
import {
  DEFAULT_ACTOR_RESTRICTIONS,
} from './actor'

export default definePlugin((nitroApp) => {
  const logger = useLogger('auth:plugin')

  nitroApp.hooks.hook('czo:init', async () => {
    const container = useContainer()
    const config = await container.make('config')

    const authConfig = config.auth

    if (!authConfig?.secret) {
      logger.warn('Auth secret not configured — auth module will not initialize. Set AUTH_SECRET.')
      return
    }

    if (authConfig.secret.length < 32) {
      logger.error('Auth secret must be at least 32 characters. Auth module will not initialize.')
      return
    }

    registerDbSchema(authSchema)
    registerRelations(authRelations)

    registerSeeder('users', {
      refine: f => ({
        count: 5,
        columns: {
          name: f.fullName(),
          email: f.email(),
          role: f.valuesFromArray({ values: ['admin', 'user'] }),
        },
      }),
    })

    registerSeeder('organizations', {
      refine: f => ({
        count: 3,
        columns: {
          name: f.companyName(),
          slug: f.string({ isUnique: true }),
        },
      }),
    })

    registerSeeder('apps', {
      dependsOn: ['users', 'organizations'],
      refine: f => ({
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
    })
  })

  // No `czo:register` hook for auth domains — access providers are seeded
  // directly into `AccessServiceLive` at layer construction (see czo:boot),
  // the same pattern as `AuthActorServiceLive`.

  nitroApp.hooks.hook('czo:boot', async () => {
    const container = useContainer()
    const config = await container.make('config')

    const authConfig = config.auth

    if (!authConfig?.secret || authConfig.secret.length < 32) {
      return
    }

    logger.start('Booting auth module...')

    // Compose the auth-module Layers and hand them to the kit, which builds the
    // single app-wide ManagedRuntime after czo:boot (providing shared infra such
    // as DrizzleDbLive once). `provideMerge` wires OrganizationService into
    // ApiKeyService's deps AND keeps it visible at the runtime surface so
    // resolvers can yield* it. `mergeAll` adds the sibling services. The
    // BetterAuth instance is materialized lazily by `makeBetterAuthLive`, which
    // `yield*`s AccessService (seeded with the 4 auth domains and frozen at
    // construction) and DrizzleDb to call `createAuth(db, { ...opts, ac, roles })`.
    const accessOptions = [
      { name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY },
      { name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY },
      { name: 'api-key', statements: API_KEY_STATEMENTS, hierarchy: API_KEY_HIERARCHY },
      { name: 'apps', statements: APPS_STATEMENTS, hierarchy: APPS_HIERARCHY },
    ] as const
    const AccessServiceLive = makeAccessServiceLive(accessOptions as any, true)
    const BetterAuthLive = makeBetterAuthLive({
      app: config.app,
      secret: authConfig.secret,
      baseUrl: config.baseUrl,
      socials: authConfig.socials,
      storage: (await container.make('useStorage'))('auth'),
    })
    const UserServiceLive = makeUserServiceLive()
    const OrganizationServiceLive = makeOrganizationServiceLive()
    // Actor-type registry is seeded from DEFAULT_ACTOR_RESTRICTIONS at layer
    // construction and frozen immediately — there is no post-boot hook for other
    // modules to extend it, so freezing eagerly keeps the invariant honest.
    const AuthActorServiceLive = makeAuthActorServiceLive(DEFAULT_ACTOR_RESTRICTIONS, true)
    // Each service is paired with its event bus via `provideMerge` so the bus
    // satisfies the service's `yield* XxxEvents` requirement AND stays visible
    // at the runtime surface for external subscribers.
    const AuthModuleLive = Layer.mergeAll(
      ApiKeyServiceLive.pipe(
        Layer.provideMerge(OrganizationServiceLive.pipe(Layer.provideMerge(OrganizationEventsLive))),
      ),
      UserServiceLive.pipe(Layer.provideMerge(UserEventBusLive)),
      AuthServiceLive,
      AuthActorServiceLive,
    ).pipe(
      // `provideMerge` (not `provide`) so `BetterAuth` and `AccessService`
      // stay visible at the runtime surface — request-time consumers (route
      // handlers, context-factory) need to `runEffect(useRuntime(), BetterAuth)`
      // without forking a separate inner runtime.
      Layer.provideMerge(BetterAuthLive),
      Layer.provideMerge(AccessServiceLive),
    )
    registerEffectLayer(AuthModuleLive)
    logger.info('Auth Effect layer registered (ApiKeyService, OrganizationService, UserService, AuthService, AuthActorService, BetterAuth, AccessService)')

    // No IoC binding for `auth` — request-time consumers (context-factory,
    // catch-all route) read it directly via `runEffect(useRuntime(), BetterAuth)`.

    // await registerAppConsumer()
    // await registerWebhookDispatcher()

    logger.info(`Actor registry seeded with ${Object.keys(DEFAULT_ACTOR_RESTRICTIONS).length} type(s) and frozen; access registry seeded with ${accessOptions.length} domain(s) and frozen`)

    // Register GraphQL schema (Pothos builder contributions) when auth is properly configured
    registerAuthScopes(authScopes)
    registerGraphQLSchema(registerAuthSchema)
    logger.info('GraphQL schema registered')

    logger.success('Auth module booted')
  })
})
