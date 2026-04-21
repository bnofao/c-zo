import type { SchemaBuilder } from '@czo/kit/graphql'
import { registerAccountSchema } from './account'
import { registerApiKeySchema } from './api-key'
import { registerAppSchema } from './app'
import { registerOrganizationSchema } from './organization'
import { registerTwoFactorSchema } from './two-factor'
import { registerUserSchema } from './user'

export function registerAuthSchema(builder: SchemaBuilder): void {
  registerUserSchema(builder)
  registerOrganizationSchema(builder)
  registerAccountSchema(builder)
  registerApiKeySchema(builder)
  registerTwoFactorSchema(builder)
  registerAppSchema(builder)
}
