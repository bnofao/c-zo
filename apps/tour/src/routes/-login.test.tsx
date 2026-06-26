import { describe, expect, it, vi } from 'vitest'

vi.mock('../server/auth.server', () => ({ fetchMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
const { Route } = await import('./login')

const me = { id: '1', name: 'A', email: 'a@x.com', role: 'admin', permissions: [] }
const run = (ctx: unknown) => (Route.options.beforeLoad as (a: { context: unknown }) => unknown)({ context: ctx })

describe('/login guard', () => {
  it('redirects to / when already authenticated', () => {
    let thrown: unknown
    try {
      run({ me })
    }
    catch (e) {
      thrown = e
    }
    expect(thrown instanceof Response && (thrown as Response & { options: { to: string } }).options?.to).toBe('/')
  })

  it('renders the login page when anonymous (no redirect)', () => {
    expect(run({ me: null })).toBeUndefined()
  })
})
