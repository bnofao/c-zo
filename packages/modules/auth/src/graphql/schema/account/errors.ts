import type { AuthGraphQLSchemaBuilder } from '@czo/auth/graphql'
import { registerError } from '@czo/kit/graphql'
import {
  IncorrectCurrentPassword,
  InvalidEmailVerificationToken,
  InvalidPasswordResetToken,
} from '../../../services/account'

export function registerAccountErrors(builder: AuthGraphQLSchemaBuilder): void {
  registerError(builder, InvalidPasswordResetToken, { name: 'InvalidPasswordResetTokenError' })
  registerError(builder, InvalidEmailVerificationToken, { name: 'InvalidEmailVerificationTokenError' })
  registerError(builder, IncorrectCurrentPassword, { name: 'IncorrectCurrentPasswordError' })
}
