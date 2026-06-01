import type { Relations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import { and, eq } from 'drizzle-orm'
import { accounts } from '../../database/schema'

/**
 * Pure helpers for the `accounts(providerId='credential')` row lifecycle —
 * shared between `http/credential.ts` signUp, `UserService.create` (initial
 * link when a password is provided), and `AccountService.resetPassword` /
 * `changePassword` (rotation).
 *
 * They take `db` (or a transaction) as a parameter so the caller decides
 * the transactional scope. `DbOrTx` captures exactly the methods we use
 * (`insert` and `update`) — Drizzle's `PgEffectTransaction` shares those
 * methods with `Database` but is missing `$client`, so the structural slice
 * accepts both.
 *
 * Functions return the raw Drizzle Effect — callers map the error to their
 * own tagged-error shape (`CredentialLinkFailed` / `AccountDbFailed` /
 * `CredentialDbFailed`) via `Effect.mapError` or a `dbErr` wrapper.
 */

/** `accounts.providerId` value for username+password (credential) accounts. */
export const CREDENTIAL_PROVIDER = 'credential'

type DbOrTx = Pick<Database<Relations>, 'insert' | 'update'>

/** Insert the initial `credential` account row for a fresh user. */
export function insertCredential(
  db: DbOrTx,
  userId: number,
  hashedPassword: string,
  now: Date = new Date(),
) {
  return db.insert(accounts).values({
    userId,
    accountId: String(userId),
    providerId: CREDENTIAL_PROVIDER,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  })
}

/** Rotate the password on the existing `credential` account row. */
export function updateCredentialPassword(
  db: DbOrTx,
  userId: number,
  hashedPassword: string,
  now: Date = new Date(),
) {
  return db.update(accounts)
    .set({ password: hashedPassword, updatedAt: now })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, CREDENTIAL_PROVIDER)))
}
