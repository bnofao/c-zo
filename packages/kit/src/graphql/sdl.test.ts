import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { initBuilder, buildSchema, _resetBuilderState } from './builder'
import { emitSDL, verifySDL } from './sdl'

const db = drizzle.mock()
const tmpFile = join(tmpdir(), `kit-sdl-test-${process.pid}.graphqls`)

beforeEach(() => _resetBuilderState())
afterEach(() => { if (existsSync(tmpFile)) rmSync(tmpFile) })

describe('emitSDL', () => {
  it('writes SDL to the given path with default header', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)

    emitSDL({ schema, outputPath: tmpFile })

    expect(existsSync(tmpFile)).toBe(true)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('scalar DateTime')
  })

  it('applies lexicographic sort by default (stable diffs)', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile })

    const first = readFileSync(tmpFile, 'utf-8')
    _resetBuilderState()
    const builder2 = initBuilder({ db, relations: {} })
    const schema2 = buildSchema(builder2)
    emitSDL({ schema: schema2, outputPath: tmpFile })

    const second = readFileSync(tmpFile, 'utf-8')
    expect(first).toBe(second)
  })

  it('accepts a custom header', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile, header: '# my header\n\n' })
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content.startsWith('# my header\n\n')).toBe(true)
  })
})

describe('verifySDL', () => {
  it('returns true when file matches current schema', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile })
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(true)
  })

  it('returns false when file missing', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(false)
  })

  it('returns false when content differs', () => {
    const builder = initBuilder({ db, relations: {} })
    const schema = buildSchema(builder)
    emitSDL({ schema, outputPath: tmpFile, header: '# a\n\n' })
    expect(verifySDL({ schema, outputPath: tmpFile, header: '# b\n\n' })).toBe(false)
  })
})
