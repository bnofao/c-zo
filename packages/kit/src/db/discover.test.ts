import { resolve } from 'node:path'
import { isAbsolute } from 'pathe'
import { describe, expect, it } from 'vitest'
import { discoverModuleSchemas } from './discover'

describe('discoverModuleSchemas', () => {
  const mazoDir = resolve(__dirname, '../../../../apps/mazo')

  it('should discover auth schema from nitro.config.ts', () => {
    const schemas = discoverModuleSchemas('./nitro.config.ts', { cwd: mazoDir })

    expect(schemas.length).toBeGreaterThanOrEqual(1)
    expect(schemas.some(s => s.includes('auth/dist/database/schema.js'))).toBe(true)
  })

  it('should return absolute paths', () => {
    const schemas = discoverModuleSchemas('./nitro.config.ts', { cwd: mazoDir })

    for (const schema of schemas) {
      expect(isAbsolute(schema)).toBe(true)
    }
  })

  it('should ignore non-string modules (imported objects)', () => {
    const schemas = discoverModuleSchemas('./nitro.config.ts', { cwd: mazoDir })

    // kitModule is an imported object, not a string — should not appear
    expect(schemas.every(s => !s.includes('kit/src/database'))).toBe(true)
  })
})
