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
  registerError(builder, Attribute.AttributeNotFound, { name: 'AttributeNotFoundError' })
  registerError(builder, Attribute.AttributeSlugTaken, {
    name: 'AttributeSlugTakenError',
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, Attribute.AttributeDbFailed, { name: 'AttributeDbFailedError' })
  registerError(builder, Attribute.ReferenceEntityRequired, { name: 'ReferenceEntityRequiredError' })
  registerError(builder, Attribute.ReferenceEntityNotAllowed, { name: 'ReferenceEntityNotAllowedError' })
  registerError(builder, Attribute.UnitNotAllowed, { name: 'UnitNotAllowedError' })

  // ── Choice value service errors ───────────────────────────────────────────
  registerError(builder, AttributeValue.AttributeValueNotFound, { name: 'AttributeValueNotFoundError' })
  registerError(builder, AttributeValue.AttributeValueSlugTaken, {
    name: 'AttributeValueSlugTakenError',
    fields: t => ({ slug: t.exposeString('slug') }),
  })
  registerError(builder, AttributeValue.SwatchRequiresColorOrFile, { name: 'SwatchRequiresColorOrFileError' })
  registerError(builder, AttributeValue.SwatchVisualInvalid, {
    name: 'SwatchVisualInvalidError',
    fields: t => ({ reason: t.exposeString('reason') }),
  })
  registerError(builder, AttributeValue.AttributeParentNotOwned, { name: 'AttributeParentNotOwnedError' })

  // ── Typed value service errors ────────────────────────────────────────────
  registerError(builder, TypedValue.TypedValueNotFound, { name: 'TypedValueNotFoundError' })
}
