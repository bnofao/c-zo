/**
 * Shared E2E harness for product: boots the FULL dependency chain
 * `[auth, translation, attribute, stock-location, channel, price, inventory,
 * product]` on one Postgres Testcontainer. This is the first runtime build of
 * the whole product GraphQL schema.
 *
 * Mirrors `@czo/price`'s harness; the only material difference is the module
 * list + migrations array (product needs every upstream module's schema), and a
 * `createOrgWithProductAccess` helper that makes the signed-up user a member of
 * a fresh org holding the `product` access role (cumulative with `org:owner`).
 */
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import attributeModule from '@czo/attribute'
import authModule from '@czo/auth'
import { Organization, User } from '@czo/auth/services'
import channelModule from '@czo/channel'
import inventoryModule from '@czo/inventory'
import { decodeGlobalID } from '@czo/kit/graphql'
import { bootTestApp } from '@czo/kit/testing'
import priceModule from '@czo/price'
import stockLocationModule from '@czo/stock-location'
import translationModule from '@czo/translation'
import { Effect, Exit, Scope } from 'effect'
import productModule from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const m = (mod: string) => resolve(here, `../../../${mod}/migrations`)

// Migration order MUST follow dependency order — auth first, product last.
const AUTH_MIGRATIONS = m('auth')
const TRANSLATION_MIGRATIONS = m('translation')
const ATTRIBUTE_MIGRATIONS = m('attribute')
const STOCK_LOCATION_MIGRATIONS = m('stock-location')
const CHANNEL_MIGRATIONS = m('channel')
const PRICE_MIGRATIONS = m('price')
const INVENTORY_MIGRATIONS = m('inventory')
const PRODUCT_MIGRATIONS = resolve(here, '../../migrations')

const GRAPHQL_URL = 'http://localhost/graphql'
const AUTH_URL = 'http://localhost/api/auth'

export interface BootedApp {
  fetch: (req: Request) => Promise<Response>
  runEffect: <A, E>(e: Effect.Effect<A, E, any>) => Promise<A>
  close: () => Promise<void>
}
export interface GqlResult { data?: any, errors?: { message: string }[] }
export interface SignedUpUser { readonly token: string, readonly userId: number, readonly ip: string }

export interface OrgWithAccess {
  readonly orgGlobalId: string
  readonly orgNumericId: number
}

export interface ProductHarness {
  readonly app: BootedApp
  readonly close: () => Promise<void>
  readonly gql: (query: string, variables?: Record<string, unknown>, token?: string, ip?: string) => Promise<GqlResult>
  readonly signUp: (email: string, name: string, password: string) => Promise<SignedUpUser>
  readonly grantGlobalRole: (userId: number, role: string) => Promise<void>
  readonly createOrgWithProductAccess: (user: SignedUpUser, name: string, slug: string) => Promise<OrgWithAccess>
}

export async function bootProductApp(): Promise<ProductHarness> {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only secret; auth reads it via Effect Config at boot
  process.env.AUTH_SECRET = 'x'.repeat(40)
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only app id; auth reads it via Effect Config at boot
  process.env.AUTH_APP = 'test'

  const scope = await Effect.runPromise(Scope.make())
  const app = (await Effect.runPromise(
    bootTestApp({
      modules: [
        authModule,
        translationModule,
        attributeModule,
        stockLocationModule,
        channelModule,
        priceModule,
        inventoryModule,
        productModule,
      ],
      migrations: [
        AUTH_MIGRATIONS,
        TRANSLATION_MIGRATIONS,
        ATTRIBUTE_MIGRATIONS,
        STOCK_LOCATION_MIGRATIONS,
        CHANNEL_MIGRATIONS,
        PRICE_MIGRATIONS,
        INVENTORY_MIGRATIONS,
        PRODUCT_MIGRATIONS,
      ],
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )) as BootedApp

  let signUpCount = 0

  const gql: ProductHarness['gql'] = async (query, variables = {}, token, ip) => {
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

  const signUp: ProductHarness['signUp'] = async (email, name, password) => {
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

  // Grant a GLOBAL role (for base/global rows — `{ auth: true }` defers to the
  // user's global role). Reuses auth's OrganizationService global-role path.
  const grantGlobalRole: ProductHarness['grantGlobalRole'] = (userId, role) =>
    app.runEffect(Effect.gen(function* () {
      const users = yield* User.UserService
      yield* users.setRole(userId, role)
    })).then(() => undefined)

  // Create an org owned by `user` and append the `product:admin` feature role to
  // the creator's membership (kept cumulative with `org:owner`, mirroring price's
  // setMemberRole — demoting the sole owner is rejected).
  const createOrgWithProductAccess: ProductHarness['createOrgWithProductAccess'] = async (user, name, slug) => {
    const created = await gql(
      `mutation ($input: CreateOrganizationInput!) {
        createOrganization(input: $input) {
          ... on CreateOrganizationSuccess { data { organization { id } } }
        }
      }`,
      { input: { name, slug } },
      user.token,
      user.ip,
    )
    if (created.errors)
      throw new Error(`createOrganization failed: ${JSON.stringify(created.errors)}`)
    const orgGlobalId: string | undefined = created.data?.createOrganization?.data?.organization?.id
    if (!orgGlobalId)
      throw new Error(`createOrganization returned no org id: ${JSON.stringify(created.data)}`)
    const orgNumericId = Number(decodeGlobalID(orgGlobalId).id)

    await app.runEffect(Effect.gen(function* () {
      const org = yield* Organization.OrganizationService
      const member = yield* org.findFirstMember(orgNumericId, { where: { userId: user.userId } })
      yield* org.updateMemberRole({ id: member.id, organizationId: orgNumericId, role: `org:owner,product:admin` })
    }))

    return { orgGlobalId, orgNumericId }
  }

  const close = async () => {
    await app.close()
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }

  return { app, close, gql, signUp, grantGlobalRole, createOrgWithProductAccess }
}
