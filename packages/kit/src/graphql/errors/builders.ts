import {
  BaseGraphQLError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthenticatedError,
  type FieldError,
} from './index'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any

/**
 * Register the standard GraphQL error types on a Pothos builder.
 * Called automatically by initBuilder().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerErrorTypes(builder: AnyBuilder): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ErrorInterface = (builder as any).interfaceRef('Error').implement({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      message: t.exposeString('message'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      code: t.string({ resolve: (e: any) => e.code }),
    }),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FieldErrorObject = (builder as any).objectRef('FieldError').implement({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder.objectType(ValidationError, {
    name: 'ValidationError',
    interfaces: [ErrorInterface],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fields: t.field({ type: [FieldErrorObject], resolve: (e: any) => e.fields }),
    }),
  })

  builder.objectType(NotFoundError, {
    name: 'NotFoundError',
    interfaces: [ErrorInterface],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      resource: t.exposeString('resource'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: t.id({ resolve: (e: any) => String(e.id) }),
    }),
  })

  builder.objectType(ConflictError, {
    name: 'ConflictError',
    interfaces: [ErrorInterface],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      resource: t.exposeString('resource'),
      conflictField: t.exposeString('conflictField'),
    }),
  })

  builder.objectType(ForbiddenError, {
    name: 'ForbiddenError',
    interfaces: [ErrorInterface],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (t: any) => ({
      requiredPermission: t.exposeString('requiredPermission'),
    }),
  })

  builder.objectType(UnauthenticatedError, {
    name: 'UnauthenticatedError',
    interfaces: [ErrorInterface],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (_t: any) => ({}),
  })
}
