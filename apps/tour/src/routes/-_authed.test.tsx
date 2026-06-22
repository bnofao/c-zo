import { describe, expect, it, vi } from 'vitest'

vi.mock('../server/auth.server', () => ({ fetchMe: vi.fn() }))
const { fetchMe } = await import('../server/auth.server')
const { Route } = await import('./_authed')

describe('_authed guard', () => {
  it('redirects to /login when no session', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null)
    // redirect() returns a Response with .options; beforeLoad throws it
    await expect((Route.options.beforeLoad as () => Promise<unknown>)()).rejects.toSatisfy(
      (thrown: unknown) => thrown instanceof Response && (thrown as Response & { options: { to: string } }).options?.to === '/login',
    )
  })

  it('returns { me } when authenticated', async () => {
    const me = { id: '1', name: 'A', email: 'a@x.com', role: 'product:viewer' }
    vi.mocked(fetchMe).mockResolvedValue(me)
    await expect((Route.options.beforeLoad as () => Promise<unknown>)()).resolves.toEqual({ me })
  })
})
