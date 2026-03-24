import { describe, expect, it, vi } from 'vitest'
import { app } from './app'

vi.mock('@czo/kit/graphql', () => ({
  fromGlobalId: vi.fn((globalId: string) => {
    // Simulate decoding: "App:uuid-123" => { type: 'App', id: 'uuid-123' }
    const [type, id] = globalId.split(':')
    return { type, id }
  }),
}))

const resolver = app as (...args: any[]) => Promise<any>

describe('app query resolver', () => {
  const mockGetAppById = vi.fn()
  const ctx = {
    auth: {
      appService: { getAppById: mockGetAppById },
      session: { userId: 'user-1' },
    },
  } as any

  it('should decode the global ID and delegate to appService.getAppById', async () => {
    const expected = { id: 'uuid-123', appId: 'my-app', status: 'active' }
    mockGetAppById.mockResolvedValue(expected)

    const result = await resolver({}, { id: 'App:uuid-123' }, ctx, {})

    expect(mockGetAppById).toHaveBeenCalledWith('uuid-123')
    expect(result).toEqual(expected)
  })

  it('should return null when app is not found', async () => {
    mockGetAppById.mockResolvedValue(null)

    const result = await resolver({}, { id: 'App:unknown' }, ctx, {})

    expect(result).toBeNull()
  })
})
