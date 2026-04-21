import type { z } from 'zod'

export interface FieldError {
  path: string
  message: string
  code: string
}

export abstract class BaseGraphQLError extends Error {
  abstract readonly code: string
}

export class ValidationError extends BaseGraphQLError {
  readonly code = 'VALIDATION_ERROR'
  constructor(
    public readonly fields: FieldError[],
    message = 'Validation failed',
  ) {
    super(message)
    this.name = 'ValidationError'
  }

  static fromZod(err: z.ZodError): ValidationError {
    return new ValidationError(
      err.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    )
  }
}

export class NotFoundError extends BaseGraphQLError {
  readonly code = 'NOT_FOUND'
  constructor(public readonly resource: string, public readonly id: string | number) {
    super(`${resource} '${id}' not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends BaseGraphQLError {
  readonly code = 'CONFLICT'
  constructor(
    public readonly resource: string,
    public readonly conflictField: string,
    message?: string,
  ) {
    super(message ?? `${resource} conflict on ${conflictField}`)
    this.name = 'ConflictError'
  }
}

export class ForbiddenError extends BaseGraphQLError {
  readonly code = 'FORBIDDEN'
  constructor(public readonly requiredPermission: string) {
    super(`Missing permission: ${requiredPermission}`)
    this.name = 'ForbiddenError'
  }
}

export class UnauthenticatedError extends BaseGraphQLError {
  readonly code = 'UNAUTHENTICATED'
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}
