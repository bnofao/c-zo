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
  registerError(builder, UserNotFound, { name: 'UserNotFoundError' })
  registerError(builder, UserAlreadyExists, { name: 'UserAlreadyExistsError' })
  registerError(builder, InvalidRole, {
    name: 'InvalidRoleError',
    fields: t => ({ role: t.exposeString('role') }),
  })
  registerError(builder, CannotBanSelf, { name: 'CannotBanSelfError' })
  registerError(builder, CannotDemoteSelf, { name: 'CannotDemoteSelfError' })
  registerError(builder, CannotRemoveSelf, { name: 'CannotRemoveSelfError' })
  registerError(builder, UserAlreadyBanned, { name: 'UserAlreadyBannedError' })
  registerError(builder, UserNotBanned, { name: 'UserNotBannedError' })
  registerError(builder, UserNoChanges, { name: 'UserNoChangesError' })
  registerError(builder, PasswordHashFailed, { name: 'PasswordHashFailedError' })
  registerError(builder, CredentialLinkFailed, { name: 'CredentialLinkFailedError' })
}
