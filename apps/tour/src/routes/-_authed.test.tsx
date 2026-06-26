import { describe, expect, it, vi } from 'vitest'

// _authed transitively imports AppSidebar → nav-user → auth.server (server fn).
// Mock it so the test never pulls server-only code; the guard itself no longer
// calls any server fn (it reads context.me).
vi.mock('../server/auth.server', () => ({ fetchMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
const { Route } = await import('./_authed')

const me = { id: '1', name: 'A', email: 'a@x.com', role: 'admin', permissions: [] }
const run = (ctx: unknown) => (Route.options.beforeLoad as (a: { context: unknown }) => unknown)({ context: ctx })

describe('_authed guard', () => {
  it('redirects to /login when no session', () => {
    let thrown: unknown
    try {
      run({ me: null })
    }
    catch (e) {
      thrown = e
    }
    expect(thrown instanceof Response && (thrown as Response & { options: { to: string } }).options?.to).toBe('/login')
  })

  it('returns { me } when authenticated', () => {
    expect(run({ me })).toEqual({ me })
  })
})
