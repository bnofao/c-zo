import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

describe('buildApp', () => {
  it('exposes the assembly seam and an injectable db option', () => {
    const built = buildApp({ modules: [], http: { port: 0 } })
    expect(built.assembleApp).toBeDefined()
    expect(built.appLayer).toBeDefined()
    expect(typeof built.program).toBe('object')
  })
})
