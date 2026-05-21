import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as Password from './password'

describe('passwordService', () => {
  it.effect('hash produces an Argon2id PHC string', () =>
    Effect.gen(function* () {
      const hash = yield* (yield* Password.PasswordService).hash('correct horse battery staple')
      expect(hash.startsWith('$argon2id$')).toBe(true)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('hashing the same password twice yields different strings', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const a = yield* svc.hash('pw-AAAA-1111')
      const b = yield* svc.hash('pw-AAAA-1111')
      expect(a).not.toBe(b)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns true for the matching password', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const hash = yield* svc.hash('s3cret-Password!')
      expect(yield* svc.verify(hash, 's3cret-Password!')).toBe(true)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns false for a wrong password', () =>
    Effect.gen(function* () {
      const svc = yield* Password.PasswordService
      const hash = yield* svc.hash('s3cret-Password!')
      expect(yield* svc.verify(hash, 'wrong-password')).toBe(false)
    }).pipe(Effect.provide(Password.layer)))

  it.effect('verify returns false (no throw) for a malformed stored hash', () =>
    Effect.gen(function* () {
      const ok = yield* (yield* Password.PasswordService).verify('not-a-real-hash', 'whatever')
      expect(ok).toBe(false)
    }).pipe(Effect.provide(Password.layer)))
})
