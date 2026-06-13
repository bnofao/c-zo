/** Shared E2E harness for inventory: boots [auth, stock-location, inventory]. */
import type { SubGraphName } from '@czo/kit/graphql'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import authModule from '@czo/auth'
import { Organization } from '@czo/auth/services'
import { decodeGlobalID } from '@czo/kit/graphql'
import { bootTestApp } from '@czo/kit/testing'
import stockLocationModule from '@czo/stock-location'
import { Effect, Exit, Scope } from 'effect'
import inventoryModule from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const AUTH_MIGRATIONS = resolve(here, '../../../auth/migrations')
const SL_MIGRATIONS = resolve(here, '../../../stock-location/migrations')
const INVENTORY_MIGRATIONS = resolve(here, '../../migrations')

const GRAPHQL_URL = 'http://localhost/graphql'
const AUTH_URL = 'http://localhost/api/auth'

export interface BootedApp {
  fetch: (req: Request) => Promise<Response>
  runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  close: () => Promise<void>
}
export interface GqlResult { data?: any, errors?: { message: string }[] }
export interface SignedUpUser { readonly token: string, readonly userId: number, readonly ip: string }

export interface InventoryHarness {
  readonly app: BootedApp
  readonly close: () => Promise<void>
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string, ip?: string) => Promise<GqlResult>
  readonly signUp: (email: string, name: string, password: string) => Promise<SignedUpUser>
  readonly createOrganization: (token: string, name: string, slug: string, ip?: string) => Promise<{ orgGlobalId: string, orgNumericId: number }>
  readonly setMemberRole: (orgNumericId: number, userId: number, role: string) => Promise<void>
}

export interface BootInventoryOptions {
  /**
   * Which audience sub-graphs to serve at `/graphql/<name>` (in addition to the
   * full `/graphql`). Defaults to the kit default `['public']`; pass
   * `['public', 'org']` to exercise the inventory `org` sub-graph endpoint.
   */
  readonly subGraphs?: ReadonlyArray<SubGraphName>
}

export async function bootInventoryApp(options: BootInventoryOptions = {}): Promise<InventoryHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
  process.env.AUTH_APP = 'test'

  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({
      modules: [authModule, stockLocationModule, inventoryModule],
      migrations: [AUTH_MIGRATIONS, SL_MIGRATIONS, INVENTORY_MIGRATIONS],
      ...(options.subGraphs ? { buildOptions: { subGraphs: options.subGraphs } } : {}),
    })
      .pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let signUpCount = 0

  const gql: InventoryHarness['gql'] = async (query, variables = {}, token, ip) => {
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

  const signUp: InventoryHarness['signUp'] = async (email, name, password) => {
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

  const createOrganization: InventoryHarness['createOrganization'] = async (token, name, slug, ip) => {
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

  const setMemberRole: InventoryHarness['setMemberRole'] = (orgNumericId, userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const org = yield* Organization.OrganizationService
      const member = yield* org.findFirstMember(orgNumericId, { where: { userId } })
      yield* org.updateMemberRole({ id: member.id, organizationId: orgNumericId, role })
    })).then(() => undefined)

  const close = async () => {
    await app.close()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }

  return { app, close, gql, signUp, createOrganization, setMemberRole }
}
