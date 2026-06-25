import { describe, it } from '@effect/vitest'
import { ConfigProvider, Effect, Redacted } from 'effect'
import { expect } from 'vitest'
import { InitialAdminConfig } from './initial-admin'

function withEnv(env: Record<string, string>) {
  return Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))
}

describe('InitialAdminConfig', () => {
  it.effect('applies dev defaults when unset outside production', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('admin@life.dev')
        expect(Redacted.value(s.password)).toBe('DevAdmin1!')
        expect(s.name).toBe('Admin')
        expect(s.role).toBe('admin')
      })),
      withEnv({ NODE_ENV: 'development' }),
    ))

  it.effect('no defaults in production (email/password stay empty)', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('')
        expect(Redacted.value(s.password)).toBe('')
      })),
      withEnv({ NODE_ENV: 'production' }),
    ))

  it.effect('explicit env values win and dev defaults do not apply', () =>
    InitialAdminConfig.pipe(
      Effect.tap(s => Effect.sync(() => {
        expect(Redacted.value(s.email)).toBe('boss@acme.io')
        expect(s.role).toBe('admin,admin:manager')
      })),
      withEnv({
        NODE_ENV: 'development',
        INITIAL_ADMIN_EMAIL: 'boss@acme.io',
        INITIAL_ADMIN_PASSWORD: 'Sup3r-Secret!',
        INITIAL_ADMIN_ROLE: 'admin,admin:manager',
      }),
    ))
})
