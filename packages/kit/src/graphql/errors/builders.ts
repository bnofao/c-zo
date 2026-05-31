import { OptimisticLockError } from '../../db'
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

const ERROR_REFS = Symbol.for('@czo/kit/graphql:error-refs')

interface ErrorRefs {
  ErrorInterface: any
  FieldErrorObject: any
}

export interface RegisterErrorOptions {
  name: string
  fields?: (t: any) => Record<string, any>
}

/**
 * Register the standard GraphQL error types on a Pothos builder.
 * Called automatically by initBuilder().
 */
export function registerErrorTypes(builder: AnyBuilder): void {
  const ErrorInterface = builder.interfaceRef('Error').implement({
    fields: (t: any) => ({
      message: t.exposeString('message'),
      code: t.string({ resolve: (e: any) => e.code }),
    }),
  })

  const FieldErrorObject = builder.objectRef('FieldError').implement({
    fields: (t: any) => ({
      path: t.exposeString('path'),
      message: t.exposeString('message'),
      code: t.exposeString('code'),
    }),
  })

  builder[ERROR_REFS] = { ErrorInterface, FieldErrorObject } satisfies ErrorRefs

  registerError(builder, ValidationError, {
    name: 'ValidationError',
    fields: (t: any) => ({
      fields: t.field({ type: [FieldErrorObject], resolve: (e: any) => e.fields }),
    }),
  })

  registerError(builder, NotFoundError, {
    name: 'NotFoundError',
    fields: (t: any) => ({
      resource: t.exposeString('resource'),
      id: t.id({ resolve: (e: any) => String(e.id) }),
    }),
  })

  registerError(builder, ConflictError, {
    name: 'ConflictError',
    fields: (t: any) => ({
      resource: t.exposeString('resource'),
      conflictField: t.exposeString('conflictField'),
    }),
  })

  registerError(builder, ForbiddenError, {
    name: 'ForbiddenError',
    fields: (t: any) => ({
      requiredPermission: t.exposeString('requiredPermission'),
    }),
  })

  registerError(builder, UnauthenticatedError, { name: 'UnauthenticatedError' })

  registerError(builder, OptimisticLockError, {
    name: 'OptimisticLockError',
    fields: (t: any) => ({
      entityId: t.field({ type: 'ID', resolve: (e: any) => String(e.entityId) }),
      expectedVersion: t.exposeInt('expectedVersion'),
      actualVersion: t.int({ nullable: true, resolve: (e: any) => e.actualVersion }),
      code: t.string({ resolve: () => 'OPTIMISTIC_LOCK_ERROR' }),
    }),
  })
}

/**
 * Returns the implemented `Error` interface ref previously registered by
 * registerErrorTypes() on this builder. Throws if the builder hasn't been
 * initialized yet.
 *
 * Why not just `builder.interfaceRef('Error')` again? Pothos resolves refs to
 * type configs by *object identity*, not by name — a fresh interfaceRef call
 * yields a placeholder with no `.implement()` association.
 */
export function getErrorInterface(builder: AnyBuilder): any {
  const refs = builder[ERROR_REFS] as ErrorRefs | undefined
  if (!refs)
    throw new Error('registerErrorTypes(builder) was not called — call initBuilder() first')
  return refs.ErrorInterface
}

/**
 * Register a domain error class as a GraphQL ObjectType implementing the shared
 * `Error` interface. `fields` defaults to none (the interface already exposes
 * `message` and `code`).
 */
export function registerError(
  builder: AnyBuilder,
  ErrorClass: new (...args: any[]) => Error,
  opts: RegisterErrorOptions,
): void {
  builder.objectType(ErrorClass, {
    name: opts.name,
    interfaces: [getErrorInterface(builder)],
    fields: opts.fields ?? ((_t: any) => ({})),
  })
}
