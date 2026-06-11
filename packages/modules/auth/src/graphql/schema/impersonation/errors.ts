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
  registerError(builder, CannotImpersonateSelf, { name: 'CannotImpersonateSelfError', subGraphs: ['admin'] })
  registerError(builder, CannotImpersonateAdmin, { name: 'CannotImpersonateAdminError', subGraphs: ['admin'] })
  registerError(builder, CannotImpersonateBannedUser, { name: 'CannotImpersonateBannedUserError', subGraphs: ['admin'] })
  registerError(builder, CannotChainImpersonation, { name: 'CannotChainImpersonationError', subGraphs: ['admin'] })
  registerError(builder, ImpersonationTtlTooLong, { name: 'ImpersonationTtlTooLongError', subGraphs: ['admin'] })
  registerError(builder, ImpersonationNotActive, { name: 'ImpersonationNotActiveError', subGraphs: ['admin'] })
}
