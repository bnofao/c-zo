/**
 * Shared E2E harness for the attribute module's GraphQL surface.
 *
 * Boots `[auth, attribute]` on a Testcontainers Postgres via `@czo/kit/testing`'s
 * `bootTestApp` and drives the REAL h3/Yoga fetch handler — `/api/auth/**` for
 * credentials, `/graphql` for GraphQL. No mocks, no stubbed authz. Every E2E
 * test file in this folder boots ONE app via `bootAttributeApp()` in `beforeAll`
 * and tears it down in `afterAll`.
 *
 * Permission tiers exercised by the helpers:
 *   • ORG tier      — `createOrgWithAttributeAccess` makes the caller a member
 *                     with `attribute:manager,attribute:viewer` in a fresh org.
 *   • PLATFORM tier — `grantGlobalRole` sets the user's GLOBAL `users.role`
 *                     (checked when a `permission` scope carries no organization).
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { decodeGlobalID } from '@czo/kit/graphql'
import { bootTestApp } from '@czo/kit/testing'
import { Effect, Exit, Scope } from 'effect'
import authModule from '../../../auth/src/index'
import { Organization, User } from '../../../auth/src/services'
import attributeModule from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const ATTR_MIGRATIONS = resolve(here, '../../migrations')
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')

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
  /** DB numeric id (`users.id` is `generatedAlwaysAsIdentity`, so the Nth sign-up → id N). */
  readonly userId: number
}

export interface AttributeHarness {
  readonly app: BootedApp
  /** Tear down modules + release the container/pool scope. */
  readonly close: () => Promise<void>
  /** POST a GraphQL operation, optionally as a bearer token. */
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string) => Promise<GqlResult>
  /** Sign up via the real credential endpoint; returns the bearer token + numeric user id. */
  readonly signUp: (email: string, name: string, password: string) => Promise<SignedUpUser>
  /** Set a user's GLOBAL role (`users.role`) — for PLATFORM-tier permission checks. */
  readonly grantGlobalRole: (userId: number, role: string) => Promise<void>
  /**
   * Create an org as `token`'s user and grant that member
   * `attribute:manager,attribute:viewer` in it (the creator's `org:owner` role
   * alone does NOT grant the dynamically-registered `attribute:*` permissions).
   * Returns the relay + numeric org id.
   */
  readonly createOrgWithAttributeAccess: (
    token: string,
    userId: number,
    name: string,
    slug: string,
  ) => Promise<{ orgGlobalId: string, orgNumericId: number }>
}

export async function bootAttributeApp(): Promise<AttributeHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
  process.env.AUTH_APP = 'test'

  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({
      // `defineModule` returns the Module OBJECT (it calls the thunk), so the
      // default exports are values, not factories — no call here.
      modules: [authModule, attributeModule],
      migrations: [AUTH_MIGRATIONS, ATTR_MIGRATIONS],
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let signUpCount = 0

  const gql: AttributeHarness['gql'] = async (query, variables = {}, token) => {
    const res = await app.fetch(new Request(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    }))
    return res.json() as Promise<GqlResult>
  }

  const signUp: AttributeHarness['signUp'] = async (email, name, password) => {
    const res = await app.fetch(new Request(`${AUTH_URL}/sign-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    }))
    const body = (await res.json()) as { token?: string }
    if (!res.ok || !body.token)
      throw new Error(`sign-up failed (${res.status}): ${JSON.stringify(body)}`)
    signUpCount += 1
    return { token: body.token, userId: signUpCount }
  }

  const grantGlobalRole: AttributeHarness['grantGlobalRole'] = (userId, role) =>
    app.runEffect(
      Effect.gen(function* () {
        const users = yield* User.UserService
        yield* users.setRole(userId, role)
      }),
    ).then(() => undefined)

  const createOrgWithAttributeAccess: AttributeHarness['createOrgWithAttributeAccess'] = async (
    token,
    userId,
    name,
    slug,
  ) => {
    const created = await gql(
      `mutation ($input: CreateOrganizationInput!) {
        createOrganization(input: $input) {
          ... on CreateOrganizationSuccess { data { organization { id } } }
        }
      }`,
      { input: { name, slug } },
      token,
    )
    if (created.errors)
      throw new Error(`createOrganization failed: ${JSON.stringify(created.errors)}`)
    const orgGlobalId: string | undefined = created.data?.createOrganization?.data?.organization?.id
    if (!orgGlobalId)
      throw new Error(`createOrganization returned no org id: ${JSON.stringify(created.data)}`)
    const orgNumericId = Number(decodeGlobalID(orgGlobalId).id)

    await app.runEffect(
      Effect.gen(function* () {
        const org = yield* Organization.OrganizationService
        const member = yield* org.findFirstMember(orgNumericId, { where: { userId } })
        yield* org.updateMemberRole({
          id: member.id,
          organizationId: orgNumericId,
          role: 'org:owner,attribute:manager,attribute:viewer',
        })
      }),
    )
    return { orgGlobalId, orgNumericId }
  }

  const close = async () => {
    await app.close()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }

  return { app, close, gql, signUp, grantGlobalRole, createOrgWithAttributeAccess }
}
