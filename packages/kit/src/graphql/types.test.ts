import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('graphql/types', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should include default Query/Mutation type defs and scalar type defs', async () => {
    const { registeredTypeDefs } = await import('./types')
    const defs = registeredTypeDefs()

    // Base Query/Mutation + DateTime + EmailAddress scalar defs
    expect(defs.length).toBeGreaterThanOrEqual(3)
    expect(defs[0]).toContain('type Query')
    expect(defs[0]).toContain('type Mutation')
    expect(defs[0]).toContain('type Subscription')
  })

  it('should append type defs via registerTypeDefs()', async () => {
    const { registerTypeDefs, registeredTypeDefs } = await import('./types')
    const before = registeredTypeDefs().length

    const customTypeDef = { kind: 'Document' } as any
    registerTypeDefs(customTypeDef)

    const defs = registeredTypeDefs()
    expect(defs).toHaveLength(before + 1)
    expect(defs[defs.length - 1]).toBe(customTypeDef)
  })

  it('should accumulate multiple type def registrations', async () => {
    const { registerTypeDefs, registeredTypeDefs } = await import('./types')
    const before = registeredTypeDefs().length

    registerTypeDefs({ kind: 'Doc1' } as any)
    registerTypeDefs({ kind: 'Doc2' } as any)

    expect(registeredTypeDefs()).toHaveLength(before + 2)
  })

  it('should accept a raw SDL string', async () => {
    const { registerTypeDefs, registeredTypeDefs } = await import('./types')

    const sdl = 'type Foo { bar: String }'
    registerTypeDefs(sdl)

    const defs = registeredTypeDefs()
    expect(defs[defs.length - 1]).toBe(sdl)
  })
})
