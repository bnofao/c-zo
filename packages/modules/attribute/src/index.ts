/**
 * `@czo/attribute` module — defines the attribute `CzoModule`.
 *
 * Authorization (both tiers) goes through auth's `permission` scope against the
 * `attribute:{viewer,manager,admin}` hierarchy registered in `onStart`:
 *  - ORG tier: `permission` with an `organization` → caller's member role.
 *  - PLATFORM tier (organizationId == null): `permission` without an
 *    `organization` → caller's global role. No module-local scope.
 *
 * `onStart` registers the `'attribute'` access domain into auth's
 * `AccessService`; auth freezes the registry in its own `onStarted`, which
 * runs after every module's `onStart`.
 *
 * The host manifest must list this module AFTER `@czo/auth`.
 */
import type { Layer } from 'effect'
import { attributeNodeGuards, registerAttributeSchema } from '@czo/attribute/graphql'
import { attributeRelations } from '@czo/attribute/relations'
import * as attributeSchema from '@czo/attribute/schema'
import { AttributeModuleLive } from '@czo/attribute/services'
import { Access } from '@czo/auth/services'
import { defineModule } from '@czo/kit/module'
import { Effect } from 'effect'

const ATTRIBUTE_STATEMENTS = {
  attribute: ['create', 'read', 'update', 'delete'],
} as const

const ATTRIBUTE_HIERARCHY: Access.HierarchyLevel<typeof ATTRIBUTE_STATEMENTS>[] = [
  { name: 'attribute:viewer', permissions: { attribute: ['read'] } },
  { name: 'attribute:manager', permissions: { attribute: ['create', 'update'] } },
  { name: 'attribute:admin', permissions: { attribute: ['delete'] } },
]

/**
 * Construct the attribute `CzoModule`. The Layer exposes
 * `AttributeService`, `AttributeValueService`, and `TypedValueService`,
 * requiring only `DrizzleDb` (provided by `buildApp`). `onStart` registers
 * the access domain while auth's registry is still mutable; auth freezes it
 * in its own `onStarted`, which runs after every module's `onStart`.
 */
export default defineModule(() => ({
  name: 'attribute',
  version: '0.0.1',
  layer: AttributeModuleLive as unknown as Layer.Layer<never, never, never>,
  db: {
    schema: attributeSchema as unknown as Record<string, unknown>,
    relations: attributeRelations,
  },
  graphql: {
    contribution: builder => registerAttributeSchema(builder as never),
    nodeGuards: attributeNodeGuards,
  },
  onStart: Effect.gen(function* () {
    const access = yield* Access.AccessService
    yield* access.register({
      name: 'attribute',
      statements: ATTRIBUTE_STATEMENTS,
      hierarchy: ATTRIBUTE_HIERARCHY,
    })
  }) as unknown as Effect.Effect<void, never, never>,
}))
