import { layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as Access from './access'
import * as UserEvents from './events/user'
import * as Password from './password'
import * as User from './user'

const AccessLive = Access.makeLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)

// `provideMerge` keeps UserService AND its deps (DrizzleDb, Access, …) visible
// in the output context so the test body can resolve them too.
const TestLayer = User.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, AccessLive)),
  Layer.provideMerge(AuthPostgresLayer),
)

layer(TestLayer, { timeout: 120_000 })('UserService.create emailVerified', (it) => {
  it.effect('persists emailVerified: true when set', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const user = yield* users.create({
        email: 'verified@example.com',
        name: 'V',
        password: 'DevAdmin1!',
        emailVerified: true,
      })
      expect(user.emailVerified).toBe(true)
    }))

  it.effect('defaults emailVerified: false when omitted', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const user = yield* users.create({
        email: 'plain@example.com',
        name: 'P',
        password: 'DevAdmin1!',
      })
      expect(user.emailVerified).toBe(false)
    }))
})
