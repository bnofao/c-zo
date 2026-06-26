import { layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { ADMIN_HIERARCHY, ADMIN_STATEMENTS } from '../plugins/access'
import { seededAccessLayer } from '../testing/access'
import { AuthPostgresLayer, truncateAuth } from '../testing/postgres'
import * as UserEvents from './events/user'
import * as Password from './password'
import * as User from './user'

const access = seededAccessLayer(
  [{ name: 'admin', statements: ADMIN_STATEMENTS, hierarchy: ADMIN_HIERARCHY }],
  false,
)

function userLayer(defaults: ReadonlyArray<string>) {
  return User.makeLayer(defaults).pipe(
    Layer.provideMerge(Layer.mergeAll(Password.layer, UserEvents.layer, access)),
    Layer.provideMerge(AuthPostgresLayer),
  )
}

layer(userLayer([]), { timeout: 120_000 })('create — no default roles', (it) => {
  it.effect('no explicit role + empty config → role is null', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'none@x.io', name: 'N', password: 'DevAdmin1!' })
      expect(u.role).toBe(null)
    }))
})

layer(userLayer(['admin:manager', 'admin:viewer']), { timeout: 120_000 })('create — configured default roles', (it) => {
  it.effect('no explicit role → CSV of configured defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'def@x.io', name: 'D', password: 'DevAdmin1!' })
      expect(u.role).toBe('admin:manager,admin:viewer')
    }))

  it.effect('explicit role is MERGED with defaults (explicit first, deduped)', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'exp@x.io', name: 'E', password: 'DevAdmin1!', role: 'admin' })
      expect(u.role).toBe('admin,admin:manager,admin:viewer')
    }))

  it.effect('explicit role overlapping a default is not duplicated', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'dup@x.io', name: 'U', password: 'DevAdmin1!', role: 'admin:manager' })
      expect(u.role).toBe('admin:manager,admin:viewer')
    }))
})

layer(userLayer(['admin:viewer']), { timeout: 120_000 })('counts — CSV role membership', (it) => {
  it.effect('admins count matches only users whose CSV role contains "admin"', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      // role stored as 'admin,admin:viewer' (admin CSV-position 0)
      yield* users.create({ email: 'csvadmin@x.io', name: 'A', password: 'DevAdmin1!', role: 'admin' })
      // role stored as 'admin:viewer' only — "admin" not present as CSV entry
      yield* users.create({ email: 'plain@x.io', name: 'P', password: 'DevAdmin1!' })
      const counts = yield* users.counts()
      expect(counts.admins).toBe(1)
      // `all` is the non-admin bucket (partitions live users with `admins`), so
      // the admin is excluded — only `plain@x.io` remains.
      expect(counts.all).toBe(1)
    }))
})

layer(userLayer(['admin:viewer']), { timeout: 120_000 })('update/setRole — defaults re-merged', (it) => {
  it.effect('setRole merges its arg with the defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'sr@x.io', name: 'S', password: 'DevAdmin1!' })
      const updated = yield* users.setRole(u.id, 'admin')
      expect(updated.role).toBe('admin,admin:viewer')
    }))

  it.effect('update with a role merges with the defaults', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'up@x.io', name: 'U', password: 'DevAdmin1!' })
      const updated = yield* users.update(u.id, { role: 'admin' })
      expect(updated.role).toBe('admin,admin:viewer')
    }))

  it.effect('update without a role leaves the role untouched', () =>
    Effect.gen(function* () {
      yield* truncateAuth
      const users = yield* User.UserService
      const u = yield* users.create({ email: 'nr@x.io', name: 'N', password: 'DevAdmin1!' })
      const updated = yield* users.update(u.id, { name: 'Renamed' })
      expect(updated.role).toBe('admin:viewer')
      expect(updated.name).toBe('Renamed')
    }))
})
