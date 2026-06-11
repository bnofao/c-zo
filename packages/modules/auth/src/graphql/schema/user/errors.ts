import { registerError } from '@czo/kit/graphql'
import {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
} from '../../../services/user'

// Re-export the tagged-error classes from the service so resolvers can list
// them in `errors: { types: [...] }` without reaching into services/.
export {
  CannotBanSelf,
  CannotDemoteSelf,
  CannotRemoveSelf,
  CredentialLinkFailed,
  InvalidRole,
  PasswordHashFailed,
  UserAlreadyBanned,
  UserAlreadyExists,
  UserNoChanges,
  UserNotBanned,
  UserNotFound,
}

export function registerUserErrors(builder: any): void {
  registerError(builder, UserNotFound, { name: 'UserNotFoundError', subGraphs: ['admin'] })
  registerError(builder, UserAlreadyExists, { name: 'UserAlreadyExistsError', subGraphs: ['admin'] })
  registerError(builder, InvalidRole, {
    name: 'InvalidRoleError',
    subGraphs: ['admin'],
    fields: t => ({ role: t.exposeString('role') }),
  })
  registerError(builder, CannotBanSelf, { name: 'CannotBanSelfError', subGraphs: ['admin'] })
  registerError(builder, CannotDemoteSelf, { name: 'CannotDemoteSelfError', subGraphs: ['admin'] })
  registerError(builder, CannotRemoveSelf, { name: 'CannotRemoveSelfError', subGraphs: ['admin'] })
  registerError(builder, UserAlreadyBanned, { name: 'UserAlreadyBannedError', subGraphs: ['admin'] })
  registerError(builder, UserNotBanned, { name: 'UserNotBannedError', subGraphs: ['admin'] })
  registerError(builder, UserNoChanges, { name: 'UserNoChangesError', subGraphs: ['admin'] })
  registerError(builder, PasswordHashFailed, { name: 'PasswordHashFailedError', subGraphs: ['account', 'admin'] })
  registerError(builder, CredentialLinkFailed, { name: 'CredentialLinkFailedError', subGraphs: ['admin'] })
}
