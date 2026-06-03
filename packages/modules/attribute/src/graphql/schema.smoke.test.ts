import { DrizzleDb } from '@czo/kit/db'
import { GraphQLBuilder, makeGraphQLBuilder } from '@czo/kit/graphql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import authModule from '../../../auth/src/index'
import attributeModule from '../index'

describe('attribute GraphQL schema build (mocked db)', () => {
  it('exposes per-type choice connections and drops the AttributeChoice union', async () => {
    // Build the COMBINED [auth, attribute] schema, mirroring `buildApp`'s merge:
    // auth registers `Organization`, which attribute's `organizationId` args
    // (`globalID({ for: 'Organization' })`) reference — so attribute's schema can
    // no longer build standalone. (`defineModule` returns the Module object.)
    const modules: any[] = [authModule, attributeModule]
    const dbSchemas = Object.assign({}, ...modules.map(m => m.db?.schema ?? {}))
    const relations = Object.assign(
      {},
      ...modules.flatMap(m => m.db?.relations ? [m.db.relations(dbSchemas)] : []),
    )
    const contributions = modules.flatMap(m => m.graphql?.contribution ? [m.graphql.contribution] : [])
    const db = drizzle.mock()

    const layer = Layer.merge(
      makeGraphQLBuilder(contributions, [], [], relations as never),
      Layer.succeed(DrizzleDb, db as never),
    )

    const schema = await Effect.runPromise(
      Effect.gen(function* () {
        const builder = yield* GraphQLBuilder
        return yield* builder.buildSchema()
      }).pipe(Effect.provide(layer)),
    )

    const attribute = schema.getType('Attribute') as any
    const fields = attribute.getFields()

    expect(fields.values?.type.toString()).toBe('AttributeValuesConnection!')
    expect(fields.swatchValues?.type.toString()).toBe('AttributeSwatchValuesConnection!')
    expect(fields.referenceValues?.type.toString()).toBe('AttributeReferenceValuesConnection!')

    // Each choice connection accepts the optional `organizationId` arg.
    for (const f of ['values', 'swatchValues', 'referenceValues']) {
      const argNames = fields[f].args.map((a: { name: string }) => a.name)
      expect(argNames).toContain('organizationId')
    }

    // Node types still present; the old polymorphic union is gone.
    expect(schema.getType('AttributeValue')).toBeDefined()
    expect(schema.getType('AttributeSwatchValue')).toBeDefined()
    expect(schema.getType('AttributeReferenceValue')).toBeDefined()
    expect(schema.getType('AttributeChoice')).toBeUndefined()
  })
})
