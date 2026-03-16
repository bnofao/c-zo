import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@czo/kit', () => ({
  useLogger: () => ({ warn: vi.fn(), info: vi.fn() }),
}))

vi.mock('@czo/kit/event-bus', () => ({
  useHookable: vi.fn(() => Promise.resolve({ publish: vi.fn() })),
  createDomainEvent: vi.fn(input => input),
}))

let findFirstHandler: (() => any) | undefined

vi.mock('@czo/kit/db', () => ({
  Repository: class MockRepository {
    async findFirst() {
      return findFirstHandler ? findFirstHandler() : undefined
    }

    async create(values: any, _opts?: any) {
      return { ...values, version: 1 }
    }

    async update(values: any, _opts?: any) {
      return [{ id: 'loc-1', organizationId: 'org-1', handle: 'test', name: 'Test', ...values, version: 2 }]
    }
  },
}))

function createMockDb() {
  return {
    transaction: vi.fn(async (fn: any) => fn({})),
  } as any
}

// ─── Create Tests ───────────────────────────────────────────────────

describe('createStockLocationService — create', () => {
  beforeEach(() => {
    findFirstHandler = undefined
  })

  it('should create a stock location with nested address and auto-generated handle', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Main Warehouse',
      organizationId: 'org-1',
      address: {
        addressLine1: '123 Main St',
        city: 'Paris',
        countryCode: 'FR',
      },
    })

    expect(result).toBeDefined()
    expect(result.name).toBe('Main Warehouse')
    expect(result.handle).toBe('main-warehouse')
    expect(result.organizationId).toBe('org-1')
    expect(result.address).toBeDefined()
    expect(result.address.addressLine1).toBe('123 Main St')
    expect(result.address.city).toBe('Paris')
    expect(result.address.countryCode).toBe('FR')
  })

  it('should use provided handle when given', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'My Store',
      handle: 'custom-handle',
      organizationId: 'org-1',
      address: { addressLine1: '456 Oak Ave', city: 'Lyon', countryCode: 'FR' },
    })

    expect(result.handle).toBe('custom-handle')
  })

  it('should reject duplicate handle in same organization', async () => {
    findFirstHandler = () => ({ id: 'existing-location', handle: 'duplicate' })

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Duplicate',
      organizationId: 'org-1',
      address: { addressLine1: '789 Elm St', city: 'Marseille', countryCode: 'FR' },
    })).rejects.toThrow('already exists')
  })

  it('should reject invalid country code', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Invalid',
      organizationId: 'org-1',
      address: { addressLine1: '123 St', city: 'City', countryCode: 'XX' },
    })).rejects.toThrow()
  })

  it('should reject invalid handle format', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Test',
      handle: 'INVALID HANDLE!',
      organizationId: 'org-1',
      address: { addressLine1: '123 St', city: 'City', countryCode: 'FR' },
    })).rejects.toThrow()
  })

  it('should normalize country code to uppercase', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Lowercase CC',
      organizationId: 'org-1',
      address: { addressLine1: '123 St', city: 'Berlin', countryCode: 'de' },
    })

    expect(result.address.countryCode).toBe('DE')
  })

  it('should slugify names with accents', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Entrepôt Île-de-France',
      organizationId: 'org-1',
      address: { addressLine1: '1 Rue de Rivoli', city: 'Paris', countryCode: 'FR' },
    })

    expect(result.handle).toBe('entrepot-ile-de-france')
  })

  it('should require organizationId', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'No Org',
      address: { addressLine1: '1 St', city: 'City', countryCode: 'FR' },
    })).rejects.toThrow('organizationId is required')
  })
})

// ─── Update Tests ───────────────────────────────────────────────────

describe('createStockLocationService — update', () => {
  beforeEach(() => {
    findFirstHandler = () => ({
      id: 'loc-1',
      organizationId: 'org-1',
      handle: 'warehouse',
      name: 'Warehouse',
      isDefault: false,
      isActive: true,
      metadata: null,
      deletedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('should update the name', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.update('loc-1', { name: 'New Name' })

    expect(result).toBeDefined()
    expect(result.name).toBe('New Name')
  })

  it('should update the handle when unique', async () => {
    let callCount = 0
    findFirstHandler = () => {
      callCount++
      // First call: findOrFail — return the existing location
      // Second call: handle uniqueness check — return undefined (no conflict)
      return callCount === 1
        ? { id: 'loc-1', organizationId: 'org-1', handle: 'old-handle', version: 1, deletedAt: null }
        : undefined
    }

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.update('loc-1', { handle: 'new-handle' })

    expect(result.handle).toBe('new-handle')
  })

  it('should reject duplicate handle on update', async () => {
    let callCount = 0
    findFirstHandler = () => {
      callCount++
      // First call: findOrFail — the location being updated
      if (callCount === 1)
        return { id: 'loc-1', organizationId: 'org-1', handle: 'old-handle', version: 1, deletedAt: null }
      // Second call: handle uniqueness — another location owns this handle
      return { id: 'loc-2', handle: 'taken-handle' }
    }

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.update('loc-1', { handle: 'taken-handle' }))
      .rejects
      .toThrow('already exists')
  })

  it('should throw when location not found', async () => {
    findFirstHandler = () => undefined

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.update('nonexistent', { name: 'X' }))
      .rejects
      .toThrow('not found')
  })

  it('should return unchanged location when no fields provided', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.update('loc-1', {})

    expect(result).toBeDefined()
    expect(result.id).toBe('loc-1')
  })

  it('should skip handle uniqueness check when handle unchanged', async () => {
    findFirstHandler = () => ({
      id: 'loc-1',
      organizationId: 'org-1',
      handle: 'same-handle',
      version: 1,
      deletedAt: null,
    })

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    // Should not throw — handle is the same as existing
    const result = await service.update('loc-1', { handle: 'same-handle', name: 'Updated' })
    expect(result).toBeDefined()
  })

  it('should update location and address together', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.update('loc-1', {
      name: 'Updated Warehouse',
      address: { city: 'Lyon', countryCode: 'fr' },
    })

    expect(result).toBeDefined()
    expect(result.name).toBe('Updated Warehouse')
    expect(result.address).toBeDefined()
    expect(result.address!.city).toBe('Lyon')
    expect(result.address!.countryCode).toBe('FR')
  })
})

// ─── Update Address Tests ───────────────────────────────────────────

describe('createStockLocationService — updateAddress', () => {
  beforeEach(() => {
    findFirstHandler = () => ({
      id: 'loc-1',
      organizationId: 'org-1',
      handle: 'warehouse',
      name: 'Warehouse',
      version: 1,
      deletedAt: null,
    })
  })

  it('should update address fields', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.updateAddress('loc-1', { city: 'Lyon' })

    expect(result).toBeDefined()
    expect(result.city).toBe('Lyon')
  })

  it('should normalize country code to uppercase', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.updateAddress('loc-1', { countryCode: 'de' })

    expect(result.countryCode).toBe('DE')
  })

  it('should reject invalid country code on update', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.updateAddress('loc-1', { countryCode: 'XX' }))
      .rejects
      .toThrow()
  })

  it('should throw when parent location is soft-deleted', async () => {
    findFirstHandler = () => undefined // findOrFail returns undefined → not found

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.updateAddress('deleted-loc', { city: 'Paris' }))
      .rejects
      .toThrow('not found')
  })
})
