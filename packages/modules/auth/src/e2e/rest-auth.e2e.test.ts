import type { AuthHarness } from './harness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

describe('rEST auth (E2E)', () => {
  let h: AuthHarness
  beforeAll(async () => {
    h = await bootAuthApp()
  }, 120_000)
  afterAll(() => h.close())

  it('signs up and returns a usable bearer token', async () => {
    const u = await h.signUp('rest1@ex.com', 'Rest One', 'password123!')
    expect(u.token).toBeTruthy()
    const res = await h.gql(`query { myInvitations { edges { node { id } } } }`, {}, u.token, u.ip)
    expect(res.errors).toBeUndefined()
  })

  it('rejects duplicate email on sign-up', async () => {
    await h.signUp('dupe@ex.com', 'Dupe', 'password123!')
    const res = await h.app.fetch(new Request('http://localhost/api/auth/sign-up', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dupe@ex.com', name: 'Dupe2', password: 'password123!' }),
    }))
    expect(res.status).toBe(409)
  })

  it('signs in with correct credentials (sets cookie + returns token)', async () => {
    await h.signUp('login@ex.com', 'Login', 'password123!')
    const res = await h.signIn('login@ex.com', 'password123!', '10.9.9.1')
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeTruthy()
    const body = (await res.json()) as { token?: string }
    expect(body.token).toBeTruthy()
  })

  it('rejects sign-in with wrong password (401)', async () => {
    await h.signUp('wrongpw@ex.com', 'Wrong', 'password123!')
    const res = await h.signIn('wrongpw@ex.com', 'nope-nope-nope', '10.9.9.2')
    expect(res.status).toBe(401)
  })

  // Regression guard: sign-out is the only route handler that reads
  // `CookieService` from the request runtime (`yield* Cookie.CookieService`).
  // The module layer must expose it to that runtime (`provideMerge`, not a
  // private `provide`) or the handler dies "Service not found" → 500. This E2E
  // first surfaced that bug; index.ts now `provideMerge`s CookieService.
  it('signs out (204, clears the cookie)', async () => {
    const u = await h.signUp('out@ex.com', 'Out', 'password123!')
    const res = await h.signOut(u.token, u.ip)
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toBeTruthy()
  })
})
