import type { Auth } from '@czo/auth/config'
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

export function createAccountService(auth: Auth) {
  return {
    // ── Reads ──

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

    // ── Writes via better-auth ──

    async changeEmail(input: ChangeEmailInput, headers: Headers) {
      try {
        return await auth.api.changeEmail({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    async changePassword(input: ChangePasswordInput, headers: Headers) {
      try {
        return await auth.api.changePassword({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    async updateProfile(input: UpdateProfileInput, headers: Headers) {
      try {
        return await auth.api.updateUser({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    async unlinkAccount(input: UnlinkAccountInput, headers: Headers) {
      try {
        return await auth.api.unlinkAccount({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },

    async deleteAccount(input: DeleteAccountInput, headers: Headers) {
      try {
        return await auth.api.deleteUser({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'Account') }
    },
  }
}
