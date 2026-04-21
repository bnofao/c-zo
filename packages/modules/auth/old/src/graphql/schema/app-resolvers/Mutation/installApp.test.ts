import { describe, expect, it, vi } from 'vitest'
import { installApp } from './installApp'

const resolver = installApp as (...args: any[]) => Promise<any>

describe('installApp mutation resolver', () => {
  const mockInstallFromUrl = vi.fn()
  const ctx = {
    auth: {
      appService: { installFromUrl: mockInstallFromUrl },
      session: { userId: 'user-1' },
    },
  } as any

  it('should call installFromUrl with url, userId, and organizationId', async () => {
    const appRow = {
      id: '1',
      appId: 'my-app',
      status: 'pending',
      apiKey: { id: 'key-1' },
    }
    mockInstallFromUrl.mockResolvedValue(appRow)

    const result = await resolver(
      {},
      { input: { manifestUrl: 'https://example.com/manifest.json', organizationId: 'org-1' } },
      ctx,
      {},
    )

    expect(mockInstallFromUrl).toHaveBeenCalledWith(
      'https://example.com/manifest.json',
      'user-1',
      'org-1',
    )
    expect(result).toEqual(appRow)
  })

  it('should pass undefined organizationId when not provided', async () => {
    mockInstallFromUrl.mockResolvedValue({
      id: '1',
      appId: 'my-app',
      apiKey: { id: 'key-2' },
    })

    await resolver(
      {},
      { input: { manifestUrl: 'https://example.com/manifest.json', organizationId: null } },
      ctx,
      {},
    )

    expect(mockInstallFromUrl).toHaveBeenCalledWith(
      'https://example.com/manifest.json',
      'user-1',
      undefined,
    )
  })
})
