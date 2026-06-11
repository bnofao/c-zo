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
  registerError(builder, InvalidPasswordResetToken, { name: 'InvalidPasswordResetTokenError', subGraphs: ['account'] })
  registerError(builder, InvalidEmailVerificationToken, { name: 'InvalidEmailVerificationTokenError', subGraphs: ['account'] })
  registerError(builder, IncorrectCurrentPassword, { name: 'IncorrectCurrentPasswordError', subGraphs: ['account'] })
  // SP6:
  registerError(builder, InvalidEmailChangeToken, { name: 'InvalidEmailChangeTokenError', subGraphs: ['account'] })
  registerError(builder, InvalidAccountRestoreToken, { name: 'InvalidAccountRestoreTokenError', subGraphs: ['account'] })
  registerError(builder, CannotDeleteWithOwnedOrgs, { name: 'CannotDeleteWithOwnedOrgsError', subGraphs: ['account'] })
  registerError(builder, AccountUnrecoverable, { name: 'AccountUnrecoverableError', subGraphs: ['account'] })
  registerError(builder, NoCredentialAccount, { name: 'NoCredentialAccountError', subGraphs: ['account'] })
}
