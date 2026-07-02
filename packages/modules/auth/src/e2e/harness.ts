/**
 * Shared E2E harness for the auth module's GraphQL + REST surface.
 * Boots [auth] on a Testcontainers Postgres via bootTestApp and drives the real
 * h3/Yoga fetch handler. Plain vitest describe/it use it via beforeAll/afterAll.
 */
import type { SubGraphName } from '@czo/kit/graphql'
import type { Layer } from 'effect'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { decodeGlobalID } from '@czo/kit/graphql'
import { bootTestApp } from '@czo/kit/testing'
import { Effect, Exit, Scope } from 'effect'
import authModule from '../index'
import { Organization, User } from '../services'

const here = dirname(fileURLToPath(import.meta.url))
const AUTH_MIGRATIONS = resolve(here, '../../migrations')

const GRAPHQL_URL = 'http://localhost/graphql'
const AUTH_URL = 'http://localhost/api/auth'

export interface BootedApp {
  fetch: (req: Request) => Promise<Response>
  runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  close: () => Promise<void>
}

export interface GqlResult {
  data?: any
  errors?: { message: string, path?: string[], extensions?: Record<string, unknown> }[]
}

export interface SignedUpUser {
  readonly token: string
  readonly userId: number
  readonly ip: string
}

export interface AuthHarness {
  readonly app: BootedApp
  readonly close: () => Promise<void>
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string, ip?: string) => Promise<GqlResult>
  readonly signUp: (email: string, name: string, password: string) => Promise<SignedUpUser>
  readonly signIn: (email: string, password: string, ip?: string) => Promise<Response>
  readonly signOut: (token: string, ip?: string) => Promise<Response>
  readonly grantGlobalRole: (userId: number, role: string) => Promise<void>
  readonly createOrganization: (token: string, name: string, slug: string, ip?: string) => Promise<{ orgGlobalId: string, orgNumericId: number }>
  readonly setMemberRole: (orgNumericId: number, userId: number, role: string) => Promise<void>
}

export async function bootAuthApp(opts?: { readonly services?: Layer.Layer<any, unknown, never>, readonly subGraphs?: ReadonlyArray<SubGraphName> }): Promise<AuthHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
  process.env.AUTH_APP = 'test'

  const buildOptions = {
    ...(opts?.services ? { services: opts.services } : {}),
    ...(opts?.subGraphs ? { subGraphs: opts.subGraphs } : {}),
  }

  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({
      modules: [authModule],
      migrations: [AUTH_MIGRATIONS],
      ...(Object.keys(buildOptions).length > 0 ? { buildOptions } : {}),
    })
      .pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let signUpCount = 0

  const gql: AuthHarness['gql'] = async (query, variables = {}, token, ip) => {
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

  const signUp: AuthHarness['signUp'] = async (email, name, password) => {
    // Distinct X-Forwarded-For per actor so each sign-up keys its own bucket —
    // otherwise they all share `anon` and trip the per-IP sign-up cap (10/60s).
    const ip = `10.0.0.${signUpCount + 1}`
    const res = await app.fetch(new Request(`${AUTH_URL}/sign-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email, name, password }),
    }))
    const body = (await res.json()) as { token?: string, user?: { id: number } }
    if (!res.ok || !body.token || !body.user)
      throw new Error(`sign-up failed (${res.status}): ${JSON.stringify(body)}`)
    signUpCount += 1
    // Real DB id from the response — NOT the signup counter: users created
    // outside this helper (e.g. via the createUser mutation) shift the identity
    // sequence and would silently desync a counter-derived id.
    return { token: body.token, userId: body.user.id, ip }
  }

  const signIn: AuthHarness['signIn'] = (email, password, ip) =>
    app.fetch(new Request(`${AUTH_URL}/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: JSON.stringify({ email, password }),
    }))

  const signOut: AuthHarness['signOut'] = (token, ip) =>
    app.fetch(new Request(`${AUTH_URL}/sign-out`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, ...(ip ? { 'x-forwarded-for': ip } : {}) },
    }))

  const grantGlobalRole: AuthHarness['grantGlobalRole'] = (userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const users = yield* User.UserService
      // Test bootstrap: system call (no actorId) bypasses the delegation guard
      // so fixtures can grant any role directly.
      yield* users.setRole(userId, role)
    })).then(() => undefined)

  const createOrganization: AuthHarness['createOrganization'] = async (token, name, slug, ip) => {
    const created = await gql(
      `mutation ($input: CreateOrganizationInput!) {
        createOrganization(input: $input) {
          ... on CreateOrganizationSuccess { data { organization { id } } }
        }
      }`,
      { input: { name, slug } },
      token,
      ip,
    )
    if (created.errors)
      throw new Error(`createOrganization failed: ${JSON.stringify(created.errors)}`)
    const orgGlobalId: string | undefined = created.data?.createOrganization?.data?.organization?.id
    if (!orgGlobalId)
      throw new Error(`createOrganization returned no org id: ${JSON.stringify(created.data)}`)
    return { orgGlobalId, orgNumericId: Number(decodeGlobalID(orgGlobalId).id) }
  }

  const setMemberRole: AuthHarness['setMemberRole'] = (orgNumericId, userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const org = yield* Organization.OrganizationService
      const member = yield* org.findFirstMember(orgNumericId, { where: { userId } })
      yield* org.updateMemberRole({ id: member.id, organizationId: orgNumericId, role })
    })).then(() => undefined)

  const close = async () => {
    await app.close()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }

  return { app, close, gql, signUp, signIn, signOut, grantGlobalRole, createOrganization, setMemberRole }
}
