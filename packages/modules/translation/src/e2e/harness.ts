/**
 * Shared E2E harness for translation: boots [auth, translation, widget-fixture]
 * on a Testcontainers Postgres via `bootTestApp`. Drives the real h3/Yoga fetch
 * handler. `grantGlobalRole` is copied from auth's harness (sets the user's
 * GLOBAL `users.role`). `seedWidgets` inserts demo rows proving `translatedField`.
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import authModule from '@czo/auth'
import { User } from '@czo/auth/services'
import { DrizzleDb } from '@czo/kit/db'
import { bootTestApp } from '@czo/kit/testing'
import { Effect, Exit, Scope } from 'effect'
import translationModule from '../index'
import widgetFixtureModule from './fixtures/widget/index'
import { widgets, widgetTranslations } from './fixtures/widget/schema'

const here = dirname(fileURLToPath(import.meta.url))
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')
const TRANSLATION_MIGRATIONS = resolve(here, '../../migrations')
const WIDGET_FIXTURE_MIGRATIONS = resolve(here, 'fixtures/widget/migrations')

const GRAPHQL_URL = 'http://localhost/graphql'
const AUTH_URL = 'http://localhost/api/auth'

export interface BootedApp {
  fetch: (req: Request) => Promise<Response>
  runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  close: () => Promise<void>
}
export interface GqlResult { data?: any, errors?: { message: string }[] }
export interface SignedUpUser { readonly token: string, readonly userId: number, readonly ip: string }

export interface TranslationHarness {
  readonly app: BootedApp
  readonly close: () => Promise<void>
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string, ip?: string) => Promise<GqlResult>
  readonly signUp: (email: string, name: string, password: string) => Promise<SignedUpUser>
  readonly grantGlobalRole: (userId: number, role: string) => Promise<void>
  readonly runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  readonly seedWidgets: () => Promise<void>
}

export async function bootTranslationApp(): Promise<TranslationHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
  process.env.AUTH_APP = 'test'

  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({
      modules: [authModule, translationModule, widgetFixtureModule],
      migrations: [AUTH_MIGRATIONS, TRANSLATION_MIGRATIONS, WIDGET_FIXTURE_MIGRATIONS],
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let signUpCount = 0

  const gql: TranslationHarness['gql'] = async (query, variables = {}, token, ip) => {
    const res = await app.fetch(new Request(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body: JSON.stringify({ query, variables }),
    }))
    return res.json() as Promise<GqlResult>
  }

  const signUp: TranslationHarness['signUp'] = async (email, name, password) => {
    // Distinct X-Forwarded-For per actor so each sign-up keys its own bucket —
    // otherwise they all share `anon` and trip the per-IP sign-up cap (10/60s).
    const ip = `10.0.0.${signUpCount + 1}`
    const res = await app.fetch(new Request(`${AUTH_URL}/sign-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, name, password }),
    }))
    const body = (await res.json()) as { token?: string }
    if (!res.ok || !body.token)
      throw new Error(`sign-up failed (${res.status}): ${JSON.stringify(body)}`)
    signUpCount += 1
    return { token: body.token, userId: signUpCount, ip }
  }

  const grantGlobalRole: TranslationHarness['grantGlobalRole'] = (userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const users = yield* User.UserService
      yield* users.setRole(userId, role)
    })).then(() => undefined)

  const seedWidgets: TranslationHarness['seedWidgets'] = () =>
    app.runEffect(Effect.gen(function* () {
      const db = yield* DrizzleDb
      // Widget A 'Shop A' WITH an fr translation 'Boutique A'.
      const rows = yield* db.insert(widgets).values({ name: 'Shop A' }).returning()
      yield* db.insert(widgetTranslations).values({ widgetId: rows[0]!.id, localeCode: 'fr', name: 'Boutique A' })
      // Widget B 'Shop B' with NO fr translation.
      yield* db.insert(widgets).values({ name: 'Shop B' })
    })).then(() => undefined)

  const close = async () => {
    await app.close()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }

  return { app, close, gql, signUp, grantGlobalRole, runEffect: app.runEffect, seedWidgets }
}
