import { describe, expect, it, vi } from 'vitest'
import { bridgeSetCookie } from './auth.server'

describe('bridgeSetCookie', () => {
  it('re-emits life\'s Set-Cookie verbatim', () => {
    const set = vi.fn()
    bridgeSetCookie('czo_session=abc; Path=/; HttpOnly; SameSite=Lax', set)
    expect(set).toHaveBeenCalledWith('czo_session=abc; Path=/; HttpOnly; SameSite=Lax')
  })

  it('is a no-op when life sends no Set-Cookie', () => {
    const set = vi.fn()
    bridgeSetCookie(null, set)
    expect(set).not.toHaveBeenCalled()
  })
})
