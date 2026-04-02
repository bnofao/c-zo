import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('seeder', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('registerSeeder', () => {
    it('should register a seeder', async () => {
      const { registerSeeder, registeredSeeders } = await import('./seeder')

      registerSeeder('users', {
        refine: (_f: any) => ({ count: 5 }),
      })

      expect(registeredSeeders().size).toBe(1)
      expect(registeredSeeders().has('users')).toBe(true)
    })

    it('should throw on duplicate name', async () => {
      const { registerSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      expect(() => {
        registerSeeder('users', { refine: () => ({ count: 10 }) })
      }).toThrow('Seeder "users" is already registered')
    })

    it('should register multiple seeders', async () => {
      const { registerSeeder, registeredSeeders } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })

      expect(registeredSeeders().size).toBe(3)
    })
  })

  describe('topologicalSort', () => {
    it('should return seeders in dependency order', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })

      const sorted = topologicalSort()

      const appsIndex = sorted.indexOf('apps')
      const usersIndex = sorted.indexOf('users')
      const orgsIndex = sorted.indexOf('organizations')

      expect(usersIndex).toBeLessThan(appsIndex)
      expect(orgsIndex).toBeLessThan(appsIndex)
    })

    it('should return seeders without dependencies in registration order', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })

      const sorted = topologicalSort()

      expect(sorted).toEqual(['users', 'organizations'])
    })

    it('should throw on circular dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('a', { dependsOn: ['b'], refine: () => ({}) })
      registerSeeder('b', { dependsOn: ['a'], refine: () => ({}) })

      expect(() => topologicalSort()).toThrow('Circular dependency')
    })

    it('should throw when dependsOn references unknown seeder', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('apps', { dependsOn: ['nonexistent'], refine: () => ({}) })

      expect(() => topologicalSort()).toThrow('Unknown seeder dependency "nonexistent"')
    })

    it('should filter by only and resolve transitive dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })
      registerSeeder('organizations', { refine: () => ({ count: 3 }) })
      registerSeeder('apps', {
        dependsOn: ['users', 'organizations'],
        refine: () => ({ count: 10 }),
      })
      registerSeeder('products', { refine: () => ({ count: 20 }) })

      const sorted = topologicalSort(['apps'])

      expect(sorted).toContain('users')
      expect(sorted).toContain('organizations')
      expect(sorted).toContain('apps')
      expect(sorted).not.toContain('products')
    })

    it('should handle deep transitive dependencies', async () => {
      const { registerSeeder, topologicalSort } = await import('./seeder')

      registerSeeder('a', { refine: () => ({}) })
      registerSeeder('b', { dependsOn: ['a'], refine: () => ({}) })
      registerSeeder('c', { dependsOn: ['b'], refine: () => ({}) })

      const sorted = topologicalSort(['c'])

      expect(sorted).toEqual(['a', 'b', 'c'])
    })
  })

  describe('runSeeder', () => {
    it('should call seed with merged refine configs in dependency order', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn()

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      const mockDb = {}
      const mockSchema = { users: {}, apps: {} }

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue(mockDb),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue(mockSchema),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      const usersRefine = vi.fn().mockReturnValue({ count: 5 })
      const appsRefine = vi.fn().mockReturnValue({ count: 10 })

      registerSeeder('users', { refine: usersRefine })
      registerSeeder('apps', { dependsOn: ['users'], refine: appsRefine })

      await runSeeder()

      expect(mockSeedFn).toHaveBeenCalledWith(mockDb, mockSchema)
      expect(mockSeedRefine).toHaveBeenCalledTimes(1)

      // Extract the refine callback and invoke it to verify fusion
      const refineCallback = mockSeedRefine.mock.calls[0]![0]
      const fakeF = { fullName: () => 'mock' }
      const result = refineCallback(fakeF)

      expect(usersRefine).toHaveBeenCalledWith(fakeF)
      expect(appsRefine).toHaveBeenCalledWith(fakeF)
      expect(result).toEqual({ users: { count: 5 }, apps: { count: 10 } })
    })

    it('should call reset before seed when reset option is true', async () => {
      const callOrder: string[] = []
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn().mockImplementation(() => {
        callOrder.push('reset')
      })
      mockSeedRefine.mockImplementation(() => {
        callOrder.push('seed')
      })

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      const mockDb = {}
      const mockSchema = { users: {} }

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue(mockDb),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue(mockSchema),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      await runSeeder({ reset: true })

      expect(mockResetFn).toHaveBeenCalledWith(mockDb, mockSchema)
      expect(callOrder).toEqual(['reset', 'seed'])
    })

    it('should not call reset when reset option is false', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })
      const mockResetFn = vi.fn()

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: mockResetFn,
      }))

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue({}),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue({ users: {} }),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      registerSeeder('users', { refine: () => ({ count: 5 }) })

      await runSeeder()

      expect(mockResetFn).not.toHaveBeenCalled()
    })

    it('should filter seeders when only is provided', async () => {
      const mockSeedRefine = vi.fn()
      const mockSeedFn = vi.fn().mockReturnValue({ refine: mockSeedRefine })

      vi.doMock('drizzle-seed', () => ({
        seed: mockSeedFn,
        reset: vi.fn(),
      }))

      vi.doMock('./manager', () => ({
        useDatabase: vi.fn().mockResolvedValue({}),
      }))

      vi.doMock('./schema-registry', () => ({
        registeredSchemas: vi.fn().mockReturnValue({ users: {}, apps: {}, products: {} }),
      }))

      const { registerSeeder, runSeeder } = await import('./seeder')

      const usersRefine = vi.fn().mockReturnValue({ count: 5 })
      const appsRefine = vi.fn().mockReturnValue({ count: 10 })
      const productsRefine = vi.fn().mockReturnValue({ count: 20 })

      registerSeeder('users', { refine: usersRefine })
      registerSeeder('apps', { dependsOn: ['users'], refine: appsRefine })
      registerSeeder('products', { refine: productsRefine })

      await runSeeder({ only: ['apps'] })

      const refineCallback = mockSeedRefine.mock.calls[0]![0]
      const result = refineCallback({})

      expect(result).toHaveProperty('users')
      expect(result).toHaveProperty('apps')
      expect(result).not.toHaveProperty('products')
    })
  })
})
