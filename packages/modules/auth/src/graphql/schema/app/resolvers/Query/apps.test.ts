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

  it('should pass connection args to listApps', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })

    await appsResolver({}, { first: 10, after: 'cursor-1' }, makeCtx('org-session'), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      { first: 10, after: 'cursor-1', last: undefined, before: undefined },
      undefined,
      'org-session',
    )
  })

  it('should pass undefined organizationId when session has none', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })

    await appsResolver({}, { first: 5 }, makeCtx(null), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      { first: 5, after: undefined, last: undefined, before: undefined },
      undefined,
      undefined,
    )
  })

  it('should pass orderBy when provided', async () => {
    mockListApps.mockResolvedValue({ nodes: [], totalCount: 0, getCursor: () => '' })

    const orderBy = { field: 'CREATED_AT', direction: 'ASC' }
    await appsResolver({}, { first: 10, orderBy }, makeCtx(null), {} as any)

    expect(mockListApps).toHaveBeenCalledWith(
      { first: 10, after: undefined, last: undefined, before: undefined },
      orderBy,
      undefined,
    )
  })
})
