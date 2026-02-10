import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/types', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should include default Query and Mutation type defs', async () => {
    const { registeredTypeDefs } = await import('./types')
    const defs = registeredTypeDefs()

    expect(defs).toHaveLength(1)
    expect(defs[0]).toContain('type Query')
    expect(defs[0]).toContain('type Mutation')
  })

  it('should append type defs via registerTypeDefs()', async () => {
    const { registerTypeDefs, registeredTypeDefs } = await import('./types')

    const customTypeDef = { kind: 'Document' } as any
    registerTypeDefs(customTypeDef)

    const defs = registeredTypeDefs()
    expect(defs).toHaveLength(2)
    expect(defs[1]).toBe(customTypeDef)
  })

  it('should accumulate multiple type def registrations', async () => {
    const { registerTypeDefs, registeredTypeDefs } = await import('./types')

    registerTypeDefs({ kind: 'Doc1' } as any)
    registerTypeDefs({ kind: 'Doc2' } as any)

    expect(registeredTypeDefs()).toHaveLength(3)
  })
})
