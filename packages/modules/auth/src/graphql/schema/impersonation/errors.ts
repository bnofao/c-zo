import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  CannotChainImpersonation,
  CannotImpersonateAdmin,
  CannotImpersonateBannedUser,
  CannotImpersonateSelf,
  ImpersonationNotActive,
  ImpersonationTtlTooLong,
} from '../../../services/impersonation'

export function registerImpersonationErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, CannotImpersonateSelf, { name: 'CannotImpersonateSelfError' })
  registerError(builder, CannotImpersonateAdmin, { name: 'CannotImpersonateAdminError' })
  registerError(builder, CannotImpersonateBannedUser, { name: 'CannotImpersonateBannedUserError' })
  registerError(builder, CannotChainImpersonation, { name: 'CannotChainImpersonationError' })
  registerError(builder, ImpersonationTtlTooLong, { name: 'ImpersonationTtlTooLongError' })
  registerError(builder, ImpersonationNotActive, { name: 'ImpersonationNotActiveError' })
}
