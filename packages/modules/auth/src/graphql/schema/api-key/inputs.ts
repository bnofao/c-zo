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
  id: string
}

export function registerApiKeyInputs(builder: AuthGraphQLSchemaBuilder): void {
  const ApiKeyOwnerTypeRef = builder.enumType('ApiKeyOwnerType', {
    values: Object.fromEntries(apiKeyOwnerTypeValues.map(v => [v, { value: v }])),
  })

  builder.inputType('ApiKeyOwnerInput', {
    fields: t => ({
      type: t.field({ type: ApiKeyOwnerTypeRef, required: true }),
      id: t.id({ required: true }),
    }),
  })
}
