// ─── Owner discriminator (shared by mutations and queries) ───────────────────

// ─── Pothos input type registration ──────────────────────────────────────────

import type { AuthGraphQLSchemaBuilder } from '../../.'

export const apiKeyOwnerTypeValues = ['USER', 'ORGANIZATION'] as const
export type ApiKeyOwnerType = (typeof apiKeyOwnerTypeValues)[number]

/**
 * TS shape of the `ApiKeyOwnerInput` GraphQL input type.
 * Registered in `graphql/index.ts → BuilderSchemaInputs` so Pothos infers it
 * automatically at every `t.field({ type: 'ApiKeyOwnerInput' })` use site —
 * no manual casts in mutation resolvers.
 */
export interface ApiKeyOwnerInput {
  type: ApiKeyOwnerType
  /** Relay global ID, decoded + type-validated by Pothos (`User` | `Organization`). */
  id: { typename: string, id: string }
}

export function registerApiKeyInputs(builder: AuthGraphQLSchemaBuilder): void {
  const ApiKeyOwnerTypeRef = builder.enumType('ApiKeyOwnerType', {
    values: Object.fromEntries(apiKeyOwnerTypeValues.map(v => [v, { value: v }])),
  })

  builder.inputType('ApiKeyOwnerInput', {
    fields: t => ({
      type: t.field({ type: ApiKeyOwnerTypeRef, required: true }),
      // Pothos decodes + validates the global ID is a `User` or `Organization`
      // (rejects malformed/other types at the schema boundary); the resolver
      // additionally checks the decoded typename matches `type`.
      id: t.globalID({ for: ['User', 'Organization'], required: true }),
    }),
  })
}
