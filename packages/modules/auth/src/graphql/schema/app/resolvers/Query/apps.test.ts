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

  it('should pass where and pagination to listApps', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })
    const where = { status: { eq: 'active' } }

    await appsResolver({}, { first: 10, after: 'cursor-1', where }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { eq: 'active' } }),
        first: 10,
        after: 'cursor-1',
      }),
    )
  })

  it('should auto-scope to session organizationId when not explicitly filtered', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })

    await appsResolver({}, { first: 5 }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: expect.objectContaining({ eq: expect.any(String) }) }),
      }),
    )
  })

  it('should not override explicit organizationId filter', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })
    const where = { organizationId: { eq: 'explicit-global-id' } }

    await appsResolver({}, { first: 5, where }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: { eq: 'explicit-global-id' } }),
      }),
    )
  })

  it('should pass undefined where when no session org and no filter', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })

    await appsResolver({}, { first: 5 }, makeCtx(null), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    )
  })
})
