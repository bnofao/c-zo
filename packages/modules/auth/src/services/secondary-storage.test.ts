import { describe, expect, it, vi } from 'vitest'
import { createSecondaryStorage } from './secondary-storage'

describe('createSecondaryStorage', () => {
  function createMockStorage() {
    return {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
  }

  it('should get a value from storage', async () => {
    const mockStorage = createMockStorage()
    mockStorage.getItem.mockResolvedValue('{"session":"data"}')
    const storage = createSecondaryStorage(mockStorage as any)

    const result = await storage.get('session:abc')

    expect(result).toBe('{"session":"data"}')
    expect(mockStorage.getItem).toHaveBeenCalledWith('session:abc')
  })

  it('should return null for missing keys', async () => {
    const mockStorage = createMockStorage()
    mockStorage.getItem.mockResolvedValue(null)
    const storage = createSecondaryStorage(mockStorage as any)

    const result = await storage.get('missing-key')

    expect(result).toBeNull()
  })

  it('should set a value without TTL', async () => {
    const mockStorage = createMockStorage()
    const storage = createSecondaryStorage(mockStorage as any)

    await storage.set('key1', '{"data":"value"}')

    expect(mockStorage.setItem).toHaveBeenCalledWith('key1', '{"data":"value"}')
  })

  it('should set a value with TTL', async () => {
    const mockStorage = createMockStorage()
    const storage = createSecondaryStorage(mockStorage as any)

    await storage.set('key1', '{"data":"value"}', 3600)

    expect(mockStorage.setItem).toHaveBeenCalledWith('key1', '{"data":"value"}', { ttl: 3600 })
  })

  it('should delete a key', async () => {
    const mockStorage = createMockStorage()
    const storage = createSecondaryStorage(mockStorage as any)

    await storage.delete('key1')

    expect(mockStorage.removeItem).toHaveBeenCalledWith('key1')
  })

  it('should use setItem without options when TTL is 0 (falsy)', async () => {
    const mockStorage = createMockStorage()
    const storage = createSecondaryStorage(mockStorage as any)

    await storage.set('key1', 'value', 0)

    expect(mockStorage.setItem).toHaveBeenCalledWith('key1', 'value')
  })
})
