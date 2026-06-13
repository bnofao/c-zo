// Attribute module — GraphQL error registration.
//
// Every tagged error a mutation can surface is registered here as a GraphQL
// ObjectType implementing the shared `Error` interface (via `registerError`),
// so Pothos's errors plugin can route them by `instanceof`. Mutations declare
// the relevant subset on their `errors.types` (Task 10).
//
// `OptimisticLockError` and `ValidationError` are kit-global: the kit builder
// already registers them in `registerErrorTypes`. We only re-export them here
// for mutations to reference — re-registering would clash on the type name.

import type { AttributeGraphQLSchemaBuilder } from '..'
import { OptimisticLockError } from '@czo/kit/db'
import { registerError, ValidationError } from '@czo/kit/graphql'
import { Attribute, AttributeValue, TypedValue } from '../../services'

export { OptimisticLockError, ValidationError }

export function registerAttributeErrors(builder: AttributeGraphQLSchemaBuilder): void {
  // ── Attribute service errors ──────────────────────────────────────────────
  registerError(builder, Attribute.AttributeNotFound, { name: 'AttributeNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, Attribute.AttributeSlugTaken, {
    name: 'AttributeSlugTakenError',
    subGraphs: ['org', 'admin'],
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, Attribute.AttributeDbFailed, { name: 'AttributeDbFailedError', subGraphs: ['org', 'admin'] })
  registerError(builder, Attribute.ReferenceEntityRequired, { name: 'ReferenceEntityRequiredError', subGraphs: ['org', 'admin'] })
  registerError(builder, Attribute.ReferenceEntityNotAllowed, { name: 'ReferenceEntityNotAllowedError', subGraphs: ['org', 'admin'] })
  registerError(builder, Attribute.UnitNotAllowed, { name: 'UnitNotAllowedError', subGraphs: ['org', 'admin'] })

  // ── Choice value service errors ───────────────────────────────────────────
  registerError(builder, AttributeValue.AttributeValueNotFound, { name: 'AttributeValueNotFoundError', subGraphs: ['org', 'admin'] })
  registerError(builder, AttributeValue.AttributeValueSlugTaken, {
    name: 'AttributeValueSlugTakenError',
    subGraphs: ['org', 'admin'],
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, AttributeValue.SwatchRequiresColorOrFile, { name: 'SwatchRequiresColorOrFileError', subGraphs: ['org', 'admin'] })
  registerError(builder, AttributeValue.SwatchVisualInvalid, {
    name: 'SwatchVisualInvalidError',
    subGraphs: ['org', 'admin'],
    fields: t => ({ reason: t.exposeString('reason') }),
  })
  registerError(builder, AttributeValue.AttributeParentNotOwned, { name: 'AttributeParentNotOwnedError', subGraphs: ['org', 'admin'] })

  // ── Typed value service errors ────────────────────────────────────────────
  registerError(builder, TypedValue.TypedValueNotFound, { name: 'TypedValueNotFoundError', subGraphs: ['org', 'admin'] })
}
