import type { ErrorComponentProps } from '@tanstack/react-router'
import { Navigate } from '@tanstack/react-router'
import { classifyError } from './classify-error'
import { ErrorState } from './error-state'
import { Forbidden } from './forbidden'

/**
 * Router `defaultErrorComponent`: TanStack renders it at the errored route's own
 * Outlet, so an authed data error shows inside the `_authed` shell (sidebar and
 * header stay). Permission denial → 403 panel; expired session → redirect to
 * login; anything else → generic error with retry.
 */
export function DataErrorBoundary({ error, reset }: ErrorComponentProps) {
  switch (classifyError(error)) {
    case 'unauthenticated':
      return <Navigate to="/login" />
    case 'forbidden':
      return <Forbidden />
    default:
      return <ErrorState reset={reset} />
  }
}
