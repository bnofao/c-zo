import type { SchemaBuilder } from '@czo/kit/graphql'
// import { registerApiKeySchema } from './api-key'
import { registerImpersonationSchema } from './impersonation'
import { registerOrganizationSchema } from './organization'
// import { registerTwoFactorSchema } from './two-factor'
import { registerUserSchema } from './user'

export function registerAuthSchema(builder: SchemaBuilder): void {
  registerUserSchema(builder)
  registerOrganizationSchema(builder)
  registerImpersonationSchema(builder)
  // registerApiKeySchema(builder)
  // registerTwoFactorSchema(builder)
}
