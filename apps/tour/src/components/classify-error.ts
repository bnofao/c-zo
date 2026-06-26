import { isForbiddenError, isUnauthenticatedError } from '../graphql/admin-error'

/** Pure branch selector for the route error boundary — unit-tested without rendering. */
export function classifyError(error: unknown): 'forbidden' | 'unauthenticated' | 'generic' {
  if (isUnauthenticatedError(error))
    return 'unauthenticated'
  if (isForbiddenError(error))
    return 'forbidden'
  return 'generic'
}
