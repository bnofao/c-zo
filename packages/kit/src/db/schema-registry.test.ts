import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('schema-registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should return empty object when no schemas registered', async () => {
    const { registeredSchemas } = await import('./schema-registry')

    expect(registeredSchemas()).toEqual({})
  })

  it('should return a single registered schema', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')
    const schema = { users: 'usersTable', posts: 'postsTable' }

    registerSchema(schema)

    expect(registeredSchemas()).toEqual({ users: 'usersTable', posts: 'postsTable' })
  })

  it('should merge multiple schemas into a flat object', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')

    registerSchema({ users: 'usersTable' })
    registerSchema({ products: 'productsTable', categories: 'categoriesTable' })

    expect(registeredSchemas()).toEqual({
      users: 'usersTable',
      products: 'productsTable',
      categories: 'categoriesTable',
    })
  })

  it('should let last registration win on key conflict', async () => {
    const { registerSchema, registeredSchemas } = await import('./schema-registry')

    registerSchema({ users: 'v1' })
    registerSchema({ users: 'v2' })

    expect(registeredSchemas()).toEqual({ users: 'v2' })
  })

  // ─── Relations registry ─────────────────────────────────────────────

  it('should return empty object when no relations registered', async () => {
    const { registeredRelations } = await import('./schema-registry')

    expect(registeredRelations()).toEqual({})
  })

  it('should invoke factory with merged schemas', async () => {
    const { registerSchema, registerRelations, registeredRelations } = await import('./schema-registry')
    const factory = vi.fn().mockReturnValue({ apps: { installedByUser: 'rel1' } })

    registerSchema({ apps: 'appsTable', users: 'usersTable' })
    registerRelations(factory)

    const result = registeredRelations()

    expect(factory).toHaveBeenCalledWith({ apps: 'appsTable', users: 'usersTable' })
    expect(result).toEqual({ apps: { installedByUser: 'rel1' } })
  })

  it('should support factory that ignores schema (self-contained module)', async () => {
    const { registerRelations, registeredRelations } = await import('./schema-registry')

    registerRelations(() => ({ apps: { installedByUser: 'rel1' } }))

    expect(registeredRelations()).toEqual({ apps: { installedByUser: 'rel1' } })
  })

  it('should merge results from multiple relation factories', async () => {
    const { registerSchema, registerRelations, registeredRelations } = await import('./schema-registry')

    registerSchema({ products: 'productsTable', attributes: 'attributesTable' })
    registerRelations(() => ({ apps: { installedByUser: 'rel1' } }))
    registerRelations(schema => ({
      products: { attributes: `rel-to-${schema.attributes}` },
    }))

    expect(registeredRelations()).toEqual({
      apps: { installedByUser: 'rel1' },
      products: { attributes: 'rel-to-attributesTable' },
    })
  })

  it('should let last factory win on key conflict', async () => {
    const { registerRelations, registeredRelations } = await import('./schema-registry')

    registerRelations(() => ({ apps: 'v1' }))
    registerRelations(() => ({ apps: 'v2' }))

    expect(registeredRelations()).toEqual({ apps: 'v2' })
  })
})
