import { describe, expect, it, vi } from 'vitest'
import { apps } from './apps'

vi.mock('@czo/kit/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@czo/kit/graphql')>()
  return {
    ...actual,
    fromWhereGlobalId: vi.fn((_field: string, val: unknown) => ({ organizationId: val })),
  }
})

const appsResolver = apps as (...args: any[]) => Promise<any>

describe('apps query resolver', () => {
  const mockFindMany = vi.fn()
  const mockCount = vi.fn()

  function makeCtx(sessionOrg: string | null = null) {
    return {
      auth: {
        appService: { findMany: mockFindMany, count: mockCount },
        session: { userId: 'user-1', organizationId: sessionOrg },
      },
    } as any
  }

  it('should return connection edges for @connection directive', async () => {
    const appRow = { id: '1', createdAt: new Date() }
    mockFindMany.mockResolvedValue([appRow])
    mockCount.mockResolvedValue(1)

    const result = await appsResolver({}, { first: 10 }, makeCtx(null), {} as any)

    expect(result.edges).toHaveLength(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 11 }),
    )
  })

  it('should auto-scope to session organizationId', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await appsResolver({}, { first: 5 }, makeCtx('org-session'), {} as any)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: { eq: 'org-session' },
        }),
      }),
    )
  })

  it('should use explicit organization filter over session organizationId', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)
    const where = { organization: 'explicit-global-id' }

    await appsResolver({}, { first: 5, where }, makeCtx('org-session'), {} as any)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'explicit-global-id',
        }),
      }),
    )
  })

  it('should pass empty where when no filter and no session org', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await appsResolver({}, { first: 5 }, makeCtx(null), {} as any)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })
})
