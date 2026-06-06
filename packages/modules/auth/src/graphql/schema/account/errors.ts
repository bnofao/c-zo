import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  AccountUnrecoverable,
  CannotDeleteWithOwnedOrgs,
  IncorrectCurrentPassword,
  InvalidAccountRestoreToken,
  InvalidEmailChangeToken,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
  NoCredentialAccount,
} from '../../../services/account'

export function registerAccountErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, InvalidPasswordResetToken, { name: 'InvalidPasswordResetTokenError' })
  registerError(builder, InvalidEmailVerificationToken, { name: 'InvalidEmailVerificationTokenError' })
  registerError(builder, IncorrectCurrentPassword, { name: 'IncorrectCurrentPasswordError' })
  // SP6:
  registerError(builder, InvalidEmailChangeToken, { name: 'InvalidEmailChangeTokenError' })
  registerError(builder, InvalidAccountRestoreToken, { name: 'InvalidAccountRestoreTokenError' })
  registerError(builder, CannotDeleteWithOwnedOrgs, { name: 'CannotDeleteWithOwnedOrgsError' })
  registerError(builder, AccountUnrecoverable, { name: 'AccountUnrecoverableError' })
  registerError(builder, NoCredentialAccount, { name: 'NoCredentialAccountError' })
}
