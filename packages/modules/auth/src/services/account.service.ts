import type { Auth } from '@czo/auth/config'
import type { Database } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { accounts, users } from '../database/schema'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean
}

export interface ChangeEmailInput {
  newEmail: string
  callbackURL?: string
}

export interface UpdateProfileInput {
  name?: string
  image?: string
}

export interface DeleteAccountInput {
  password?: string
  callbackURL?: string
}

export interface UnlinkAccountInput {
  providerId: string
  accountId?: string
}

export type AccountService = ReturnType<typeof createAccountService>

// ─── Factory ─────────────────────────────────────────────────────────

export function createAccountService(db: Database, auth: Auth) {
  return {
    // ── Reads — Drizzle direct ──

    async find(id: string) {
      const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1)
      return row ?? null
    },

    async findByUser(userId: string) {
      const [row] = await db.select().from(accounts).where(eq(accounts.userId, userId)).limit(1)
      return row ?? null
    },

    async listByUser(userId: string) {
      return db.select().from(accounts).where(eq(accounts.userId, userId))
    },

    // listAccounts — kept for backwards compat with existing resolvers
    async listAccounts(headers: Headers) {
      try {
        return await (auth.api as any).listUserAccounts({ headers })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    async accountInfo(headers: Headers) {
      try {
        return await (auth.api as any).accountInfo({ headers })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    // ── Profile write — Drizzle direct ──

    async updateProfile(input: UpdateProfileInput, headers: Headers) {
      // updateProfile is used for name/image on the currently authenticated user.
      // We keep better-auth wrap here because it needs the session to identify the user.
      try {
        return await auth.api.updateUser({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    // ── Account deletion — Drizzle direct ──

    async deleteAccount(userId: string) {
      // Delete accounts + users (cascade handles sessions/etc via FK)
      await db.delete(accounts).where(eq(accounts.userId, userId))
      await db.delete(users).where(eq(users.id, userId))
      return { success: true }
    },

    // ── Verification/OAuth flows — keep as better-auth wrappers ──

    // changeEmail triggers verification email send — better-auth's domain
    async changeEmail(input: ChangeEmailInput, headers: Headers) {
      try {
        return await auth.api.changeEmail({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    // changePassword validates current password — better-auth's domain
    async changePassword(input: ChangePasswordInput, headers: Headers) {
      try {
        return await auth.api.changePassword({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    // unlinkAccount handles OAuth provider state — better-auth's domain
    async unlinkAccount(input: UnlinkAccountInput, headers: Headers) {
      try {
        return await auth.api.unlinkAccount({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },
  }
}
