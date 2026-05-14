import type { SchemaBuilder } from '@czo/kit/graphql'
// import { registerApiKeySchema } from './api-key'
import { registerOrganizationSchema } from './organization'
// import { registerTwoFactorSchema } from './two-factor'
import { registerUserSchema } from './user'

export function registerAuthSchema(builder: SchemaBuilder): void {
  registerUserSchema(builder)
  registerOrganizationSchema(builder)
  // registerApiKeySchema(builder)
  // TODO(effect-migration): the two-factor resolvers still reference
  // `ctx.auth.twoFactorService`, which was removed from AuthContext along
  // with the parked `services/twoFactor.service.ts`. They will throw at
  // runtime until the two-factor service is migrated to an Effect Tag and
  // the resolvers switched to `runEffect(ctx.auth.runtime, …)`. Kept
  // registered for now so the schema shape doesn't churn — flip to a
  // commented-out call if you need a clean build before then.
  // (account/* schema was already removed in the same pass.)
  // registerTwoFactorSchema(builder)
}
