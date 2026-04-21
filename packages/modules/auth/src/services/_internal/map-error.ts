import { APIError } from 'better-auth'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@czo/kit/graphql'

export function mapAPIError(err: unknown, resource: string): never {
  if (err instanceof APIError) {
    switch (err.status) {
      case 'BAD_REQUEST':
        throw new ValidationError(
          [{ path: 'root', message: err.message, code: (err.body as any)?.code ?? 'BAD_REQUEST' }],
          err.message,
        )
      case 'NOT_FOUND':
        throw new NotFoundError(resource, (err.body as any)?.id ?? 'unknown')
      case 'UNAUTHORIZED':
        throw new UnauthenticatedError(err.message)
      case 'FORBIDDEN':
        throw new ForbiddenError((err.body as any)?.required ?? resource)
      case 'CONFLICT':
        throw new ConflictError(resource, (err.body as any)?.field ?? 'unknown', err.message)
    }
  }
  throw err
}
