import { Schema } from 'effect'

/**
 * Shared password validation chain — min 8, max 20, must include
 * upper/lower/digit/special. Originally inlined in user/mutations.ts as Zod;
 * ported to Effect Schema and exposed as Standard Schema V1 for Pothos
 * `validate:` (consumed via @pothos/plugin-validation 4.2+).
 *
 * Multi-pattern on purpose: each failed rule emits its own issue, matching
 * the previous Zod behaviour where each `.refine` produced a distinct message.
 *
 * Scope note: only the new `passwordSchema` is migrated to Effect Schema in
 * SP5. The other Zod call sites in `user/mutations.ts` (`name`, `email`,
 * `password` on signUp) stay on Zod — broader Zod→Schema migration is out of
 * scope for this sprint.
 */
const password = Schema.String.check(
  Schema.isMinLength(8,  { message: 'Password must be at least 8 characters long' }),
  Schema.isMaxLength(20, { message: 'Password cannot exceed 20 characters' }),
  Schema.isPattern(/[A-Z]/,      { message: 'Password must contain at least one uppercase letter' }),
  Schema.isPattern(/[a-z]/,      { message: 'Password must contain at least one lowercase letter' }),
  Schema.isPattern(/\d/,         { message: 'Password must contain at least one number' }),
  Schema.isPattern(/[!@#$%^&*]/, { message: 'Password must contain at least one special character' }),
)

export const passwordSchema = Schema.toStandardSchemaV1(password)
