import { describe, expect, it, vi } from 'vitest'
import { uninstallApp } from './uninstallApp'

const resolver = uninstallApp as (...args: any[]) => Promise<any>

describe('uninstallApp mutation resolver', () => {
  const mockUninstall = vi.fn()
  const ctx = {
    auth: {
      appService: { uninstall: mockUninstall },
      session: { userId: 'user-1' },
    },
  } as any

  it('should delegate to appService.uninstall and return true', async () => {
    mockUninstall.mockResolvedValue(undefined)

    const result = await resolver({}, { appId: 'my-app' }, ctx, {})

    expect(mockUninstall).toHaveBeenCalledWith('my-app')
    expect(result).toBe(true)
  })
})
