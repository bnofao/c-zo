import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@czo/kit', () => ({
  useLogger: () => ({ warn: vi.fn(), info: vi.fn() }),
}))

vi.mock('@czo/kit/event-bus', () => ({
  useHookable: vi.fn(() => Promise.resolve({ publish: vi.fn() })),
  createDomainEvent: vi.fn(input => input),
}))

let findFirstOverride: any

vi.mock('@czo/kit/db', () => ({
  Repository: class MockRepository {
    async findFirst() {
      return findFirstOverride
    }

    async create(values: any, _opts?: any) {
      return { ...values, version: 1 }
    }
  },
}))

function createMockDb() {
  return {
    transaction: vi.fn(async (fn: any) => fn({})),
  } as any
}

describe('createStockLocationService', () => {
  beforeEach(() => {
    findFirstOverride = undefined
  })

  it('should create a stock location with auto-generated handle', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Main Warehouse',
      organizationId: 'org-1',
      addressLine1: '123 Main St',
      city: 'Paris',
      countryCode: 'FR',
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
      addressLine1: '456 Oak Ave',
      city: 'Lyon',
      countryCode: 'FR',
    })

    expect(result.handle).toBe('custom-handle')
  })

  it('should reject duplicate handle in same organization', async () => {
    findFirstOverride = { id: 'existing-location', handle: 'duplicate' }

    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Duplicate',
      organizationId: 'org-1',
      addressLine1: '789 Elm St',
      city: 'Marseille',
      countryCode: 'FR',
    })).rejects.toThrow('already exists')
  })

  it('should reject invalid country code', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Invalid',
      organizationId: 'org-1',
      addressLine1: '123 St',
      city: 'City',
      countryCode: 'XX',
    })).rejects.toThrow()
  })

  it('should reject invalid handle format', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    await expect(service.create({
      name: 'Test',
      handle: 'INVALID HANDLE!',
      organizationId: 'org-1',
      addressLine1: '123 St',
      city: 'City',
      countryCode: 'FR',
    })).rejects.toThrow()
  })

  it('should normalize country code to uppercase', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Lowercase CC',
      organizationId: 'org-1',
      addressLine1: '123 St',
      city: 'Berlin',
      countryCode: 'de',
    })

    expect(result.address.countryCode).toBe('DE')
  })

  it('should slugify names with accents', async () => {
    const { createStockLocationService } = await import('./stock-location.service')
    const service = createStockLocationService(createMockDb())

    const result = await service.create({
      name: 'Entrepôt Île-de-France',
      organizationId: 'org-1',
      addressLine1: '1 Rue de Rivoli',
      city: 'Paris',
      countryCode: 'FR',
    })

    expect(result.handle).toBe('entrepot-ile-de-france')
  })
})
