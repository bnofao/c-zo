import { registerError } from '@czo/kit/graphql'
import {
  ApiKeyNotFound,
  Unauthorized as ApiKeyUnauthorized,
  InvalidApiKey,
  KeyDisabled,
  KeyExpired,
  Misconfigured,
  NoChanges,
  RateLimited,
  RefillPairRequired,
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
  registerError(builder, InvalidApiKey, { name: 'InvalidApiKeyError', subGraphs: ['account', 'org'] })
  registerError(builder, KeyDisabled, { name: 'ApiKeyDisabledError', subGraphs: ['account', 'org'] })
  registerError(builder, KeyExpired, {
    name: 'ApiKeyExpiredError',
    subGraphs: ['account', 'org'],
    fields: t => ({ keyId: t.exposeID('keyId') }),
  })
  registerError(builder, ApiKeyUnauthorized, { name: 'ApiKeyUnauthorizedError', subGraphs: ['account', 'org'] })
  registerError(builder, RateLimited, {
    name: 'ApiKeyRateLimitedError',
    subGraphs: ['account', 'org'],
    fields: t => ({ tryAgainIn: t.exposeInt('tryAgainIn') }),
  })
  registerError(builder, Misconfigured, {
    name: 'ApiKeyMisconfiguredError',
    subGraphs: ['account', 'org'],
    fields: t => ({ reason: t.exposeString('reason') }),
  })
  registerError(builder, UsageExceeded, { name: 'ApiKeyUsageExceededError', subGraphs: ['account', 'org'] })
  registerError(builder, ApiKeyNotFound, { name: 'ApiKeyNotFoundError', subGraphs: ['account', 'org'] })
  registerError(builder, NoChanges, { name: 'ApiKeyNoChangesError', subGraphs: ['account', 'org'] })
  registerError(builder, RefillPairRequired, { name: 'ApiKeyRefillPairRequiredError', subGraphs: ['account', 'org'] })
}
