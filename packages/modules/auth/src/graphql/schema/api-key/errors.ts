import { registerError } from '@czo/kit/graphql'
import {
  ApiKeyNotFound,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NoChanges,
  RateLimited,
  RefillPairRequired,
  Unauthorized as ApiKeyUnauthorized,
  UsageExceeded,
} from '../../../services/api-key'

// Re-export the tagged-error classes from the service so resolvers can list
// them in `errors: { types: [...] }` without reaching into services/.
export {
  ApiKeyNotFound,
  ApiKeyUnauthorized,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NoChanges,
  RateLimited,
  RefillPairRequired,
  UsageExceeded,
}

export function registerApiKeyErrors(builder: any): void {
  registerError(builder, InvalidApiKey, { name: 'InvalidApiKeyError' })
  registerError(builder, KeyDisabled, { name: 'ApiKeyDisabledError' })
  registerError(builder, KeyExpired, {
    name: 'ApiKeyExpiredError',
    fields: t => ({ keyId: t.exposeID('keyId') }),
  })
  registerError(builder, ApiKeyUnauthorized, { name: 'ApiKeyUnauthorizedError' })
  registerError(builder, RateLimited, {
    name: 'ApiKeyRateLimitedError',
    fields: t => ({ tryAgainIn: t.exposeInt('tryAgainIn') }),
  })
  registerError(builder, Misconfigured, {
    name: 'ApiKeyMisconfiguredError',
    fields: t => ({ reason: t.exposeString('reason') }),
  })
  registerError(builder, UsageExceeded, { name: 'ApiKeyUsageExceededError' })
  registerError(builder, ApiKeyNotFound, { name: 'ApiKeyNotFoundError' })
  registerError(builder, NoChanges, { name: 'ApiKeyNoChangesError' })
  registerError(builder, RefillPairRequired, { name: 'ApiKeyRefillPairRequiredError' })
}
