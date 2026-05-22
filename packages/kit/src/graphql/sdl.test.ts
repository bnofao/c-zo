import type { GraphQLSchema } from 'graphql'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleDb } from '../db/effect'
import { GraphQLBuilder, makeGraphQLBuilder } from './builder'
import { emitSDL, verifySDL } from './sdl'

const db = drizzle.mock()
const tmpFile = join(tmpdir(), `kit-sdl-test-${process.pid}.graphqls`)

/**
 * Build a `GraphQLSchema` through the CURRENT builder API. The mocked drizzle
 * instance is sufficient — `toSchema()` only reads `db` as a client reference.
 */
function buildSchema(): Promise<GraphQLSchema> {
  const layer = Layer.merge(
    makeGraphQLBuilder([], [], [], {} as never),
    Layer.succeed(DrizzleDb, db as never),
  )
  return Effect.runPromise(
    Effect.gen(function* () {
      const builder = yield* GraphQLBuilder
      return yield* builder.buildSchema()
    }).pipe(Effect.provide(layer)),
  )
}

let schema: GraphQLSchema

beforeAll(async () => {
  schema = await buildSchema()
})

afterEach(() => {
  if (existsSync(tmpFile))
    rmSync(tmpFile)
})

describe('emitSDL', () => {
  it('writes SDL to the given path with default header', () => {
    emitSDL({ schema, outputPath: tmpFile })

    expect(existsSync(tmpFile)).toBe(true)
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('scalar DateTime')
  })

  it('applies lexicographic sort by default (stable diffs)', async () => {
    emitSDL({ schema, outputPath: tmpFile })
    const first = readFileSync(tmpFile, 'utf-8')

    const schema2 = await buildSchema()
    emitSDL({ schema: schema2, outputPath: tmpFile })
    const second = readFileSync(tmpFile, 'utf-8')

    expect(first).toBe(second)
  })

  it('accepts a custom header', () => {
    emitSDL({ schema, outputPath: tmpFile, header: '# my header\n\n' })
    const content = readFileSync(tmpFile, 'utf-8')
    expect(content.startsWith('# my header\n\n')).toBe(true)
  })
})

describe('verifySDL', () => {
  it('returns true when file matches current schema', () => {
    emitSDL({ schema, outputPath: tmpFile })
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(true)
  })

  it('returns false when file missing', () => {
    expect(verifySDL({ schema, outputPath: tmpFile })).toBe(false)
  })

  it('returns false when content differs', () => {
    emitSDL({ schema, outputPath: tmpFile, header: '# a\n\n' })
    expect(verifySDL({ schema, outputPath: tmpFile, header: '# b\n\n' })).toBe(false)
  })
})
