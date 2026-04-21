import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from './index'

// Pothos builder types are complex generics; using `any` here is intentional
// to keep the public API simple without leaking internal Pothos type parameters.

type AnyBuilder = any

/**
 * Register the standard GraphQL error types on a Pothos builder.
 * Called automatically by initBuilder().
 */

export function registerErrorTypes(builder: AnyBuilder): void {
  const ErrorInterface = (builder as any).interfaceRef('Error').implement({

    fields: (t: any) => ({
      message: t.exposeString('message'),

      code: t.string({ resolve: (e: any) => e.code }),
    }),
  })

  const FieldErrorObject = (builder as any).objectRef('FieldError').implement({

    fields: (t: any) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder.objectType(ValidationError, {
    name: 'ValidationError',
    interfaces: [ErrorInterface],

    fields: (t: any) => ({

      fields: t.field({ type: [FieldErrorObject], resolve: (e: any) => e.fields }),
    }),
  })

  builder.objectType(NotFoundError, {
    name: 'NotFoundError',
    interfaces: [ErrorInterface],

    fields: (t: any) => ({
      resource: t.exposeString('resource'),

      id: t.id({ resolve: (e: any) => String(e.id) }),
    }),
  })

  builder.objectType(ConflictError, {
    name: 'ConflictError',
    interfaces: [ErrorInterface],

    fields: (t: any) => ({
      resource: t.exposeString('resource'),
      conflictField: t.exposeString('conflictField'),
    }),
  })

  builder.objectType(ForbiddenError, {
    name: 'ForbiddenError',
    interfaces: [ErrorInterface],

    fields: (t: any) => ({
      requiredPermission: t.exposeString('requiredPermission'),
    }),
  })

  builder.objectType(UnauthenticatedError, {
    name: 'UnauthenticatedError',
    interfaces: [ErrorInterface],

    fields: (_t: any) => ({}),
  })
}
