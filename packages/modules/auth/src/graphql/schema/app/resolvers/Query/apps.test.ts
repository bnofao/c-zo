import { describe, expect, it, vi } from 'vitest'
import { apps } from './apps'

const appsResolver = apps as (...args: any[]) => Promise<any>

describe('apps query resolver', () => {
  const mockListApps = vi.fn()

  function makeCtx(sessionOrg: string | null = null) {
    return {
      auth: {
        appService: { listApps: mockListApps },
        session: { userId: 'user-1', organizationId: sessionOrg },
      },
    } as any
  }

  it('should use explicit organizationId over session', async () => {
    mockListApps.mockResolvedValue([])

    await appsResolver({}, { organizationId: 'org-explicit' }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith('org-explicit')
  })

  it('should fall back to session organizationId when arg is null', async () => {
    mockListApps.mockResolvedValue([])

    await appsResolver({}, { organizationId: null }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith('org-session')
  })

  it('should pass undefined when neither arg nor session has organizationId', async () => {
    const expected = [{ id: '1', appId: 'my-app', status: 'active' }]
    mockListApps.mockResolvedValue(expected)

    const result = await appsResolver({}, { organizationId: null }, makeCtx(null), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(undefined)
    expect(result).toEqual(expected)
  })
})
