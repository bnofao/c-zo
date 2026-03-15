import { describe, expect, it, vi } from 'vitest'
import { app } from './app'

const resolver = app as (...args: any[]) => Promise<any>

describe('app query resolver', () => {
  const mockGetApp = vi.fn()
  const ctx = {
    auth: {
      appService: { getApp: mockGetApp },
      session: { userId: 'user-1' },
    },
  } as any

  it('should delegate to appService.getApp with the appId argument', async () => {
    const expected = { id: '1', appId: 'my-app', status: 'active' }
    mockGetApp.mockResolvedValue(expected)

    const result = await resolver({}, { appId: 'my-app' }, ctx, {})

    expect(mockGetApp).toHaveBeenCalledWith('my-app')
    expect(result).toEqual(expected)
  })

  it('should return null when app is not found', async () => {
    mockGetApp.mockResolvedValue(null)

    const result = await resolver({}, { appId: 'unknown' }, ctx, {})

    expect(result).toBeNull()
  })
})
