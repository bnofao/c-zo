import * as Email from '@czo/kit/email'
import { expect, layer } from '@effect/vitest'
import { Duration, Effect, Layer } from 'effect'
import { Persistence } from 'effect/unstable/persistence'
import {
  ADMIN_HIERARCHY,
  ADMIN_STATEMENTS,
  ORGANIZATION_HIERARCHY,
  ORGANIZATION_STATEMENTS,
} from '../plugins/access'
import { seededAccessLayer } from '../testing/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Account from './account'
import * as Cookie from './cookie'
import * as AuthEventsMod from './events/auth'
import * as UserEventsMod from './events/user'
import * as Password from './password'
import * as Session from './session'
import * as User from './user'

// ─── Test layer composition ───────────────────────────────────────────────
// Mirrors soft-delete.integration.test.ts: mock EmailService captures sent
// mail so the subscriber's output can be asserted without a real transport.

const sent: { to: string, subject: string, html: string }[] = []
const EmailCapture: Layer.Layer<Email.EmailService> = Layer.succeed(Email.EmailService, {
  send: input => Effect.sync(() => {
    sent.push({ to: input.to, subject: input.subject, html: input.html })
  }),
})

// Seed the admin domain into the AccessService cache so `UserService.create`
// (which validates any provided role) has a role registry to check against.
const AccessSeedLayer = seededAccessLayer(
  [
    { name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY },
    { name: 'organization', statements: ORGANIZATION_STATEMENTS, hierarchy: ORGANIZATION_HIERARCHY },
  ] as never,
  true,
)

const AccountConfigLive = Account.makeAccountConfigLayer({ baseUrl: 'https://test.example.com', enumTimingBudget: Duration.zero })

const cookieLayer = Cookie.layer({
  name: 'czo.session',
  attributes: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604800 },
})

const SessionLive = Session.layer.pipe(
  Layer.provide(Layer.mergeAll(Persistence.layerMemory, cookieLayer, AuthEventsMod.layer)),
)

const UserLive = User.layer.pipe(
  Layer.provide(Layer.mergeAll(UserEventsMod.layer, AccessSeedLayer, Password.layer)),
)

const TestLayer = Account.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    SessionLive,
    UserLive,
    Password.layer,
    AuthEventsMod.layer,
    AccountConfigLive,
    EmailCapture,
  )),
  Layer.provideMerge(AuthPostgresLayer),
)

const TestLayerWithSubscribers = Account.subscribersLayer.pipe(
  Layer.provideMerge(TestLayer),
)

// ─── Suite ─────────────────────────────────────────────────────────────────

layer(TestLayerWithSubscribers, { timeout: 120_000, excludeTestServices: true })('invitation', (it) => {
  it.effect('sendInvitation emails a set-password link to the user', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      sent.length = 0
      const users = yield* User.UserService
      const created = yield* users.create({ email: 'invitee@czo.com', name: 'Invitee', password: undefined, role: undefined })
      const account = yield* Account.AccountService
      yield* account.sendInvitation({ userId: created.id, email: created.email })
      // Subscriber runs on the PubSub fiber; yield to let it drain.
      yield* Effect.sleep('50 millis')
      const mail = sent.find(m => m.to === 'invitee@czo.com')
      expect(mail).toBeDefined()
      expect(mail!.html).toContain('/reset-password?token=')
    }))
})
