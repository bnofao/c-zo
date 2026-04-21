import type { Auth } from '@czo/auth/config'
import { mapAPIError } from './_internal/map-error'

// ─── Types ───────────────────────────────────────────────────────────

export interface EnableTwoFactorInput {
  password: string
  issuer?: string
}

export interface VerifyTotpInput {
  code: string
  trustDevice?: boolean
}

export interface VerifyOtpInput {
  code: string
  trustDevice?: boolean
}

export interface VerifyBackupCodeInput {
  code: string
  disableSession?: boolean
  trustDevice?: boolean
}

export type TwoFactorService = ReturnType<typeof createTwoFactorService>

// ─── Factory ─────────────────────────────────────────────────────────

export function createTwoFactorService(auth: Auth) {
  return {
    async enable(input: EnableTwoFactorInput, headers: Headers) {
      try {
        return await auth.api.enableTwoFactor({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async disable(password: string, headers: Headers) {
      try {
        return await auth.api.disableTwoFactor({ headers, body: { password } })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async verifyTotp(input: VerifyTotpInput, headers: Headers) {
      try {
        return await auth.api.verifyTOTP({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async verifyOtp(input: VerifyOtpInput, headers: Headers) {
      try {
        return await (auth.api as any).verifyTwoFactorOTP({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async sendOtp(headers: Headers) {
      try {
        return await (auth.api as any).sendTwoFactorOTP({ headers })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async verifyBackupCode(input: VerifyBackupCodeInput, headers: Headers) {
      try {
        return await auth.api.verifyBackupCode({ headers, body: input })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async generateBackupCodes(password: string, headers: Headers) {
      try {
        return await auth.api.generateBackupCodes({ headers, body: { password } })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },

    async getTotpUri(password: string, headers: Headers) {
      try {
        return await auth.api.getTOTPURI({ headers, body: { password } })
      }
      catch (err) { mapAPIError(err, 'TwoFactor') }
    },
  }
}
