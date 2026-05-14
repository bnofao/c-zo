// ─────────────────────────────────────────────────────────────────────
// TODO(effect-migration): two-factor service — NOT YET MIGRATED.
//
// Parked while the Effect-TS migration rolls out module-by-module (done:
// apiKey, user, organization, auth). Legacy `createTwoFactorService` body
// below is commented out and the `auth:twoFactor` container binding is
// disabled in `types.ts`. When migrating, mirror the apiKey/user pattern
// (`services/two-factor.ts` Tag + `layers/two-factor.ts` impl) and restore
// the GraphQL resolvers under `graphql/schema/two-factor/`.
// ─────────────────────────────────────────────────────────────────────

// import type { Auth } from '@czo/auth/config'
// import { mapAPIError } from './_internal/map-error'

// // ─── Types ───────────────────────────────────────────────────────────

// export interface EnableTwoFactorInput {
//   password: string
//   issuer?: string
// }

// export interface VerifyTotpInput {
//   code: string
//   trustDevice?: boolean
// }

// export interface VerifyOtpInput {
//   code: string
//   trustDevice?: boolean
// }

// export interface VerifyBackupCodeInput {
//   code: string
//   disableSession?: boolean
//   trustDevice?: boolean
// }

// export type TwoFactorService = ReturnType<typeof createTwoFactorService>

// // ─── Factory ─────────────────────────────────────────────────────────

// export function createTwoFactorService(auth: Auth) {
//   return {
//     async enable(input: EnableTwoFactorInput, headers: Headers) {
//       try {
//         return await auth.api.enableTwoFactor({ headers, body: input })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async disable(password: string, headers: Headers) {
//       try {
//         return await auth.api.disableTwoFactor({ headers, body: { password } })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async verifyTotp(input: VerifyTotpInput, headers: Headers) {
//       try {
//         return await auth.api.verifyTOTP({ headers, body: input })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async verifyOtp(input: VerifyOtpInput, headers: Headers) {
//       try {
//         return await (auth.api as any).verifyTwoFactorOTP({ headers, body: input })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async sendOtp(headers: Headers) {
//       try {
//         return await (auth.api as any).sendTwoFactorOTP({ headers })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async verifyBackupCode(input: VerifyBackupCodeInput, headers: Headers) {
//       try {
//         return await auth.api.verifyBackupCode({ headers, body: input })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async generateBackupCodes(password: string, headers: Headers) {
//       try {
//         return await auth.api.generateBackupCodes({ headers, body: { password } })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },

//     async getTotpUri(password: string, headers: Headers) {
//       try {
//         return await auth.api.getTOTPURI({ headers, body: { password } })
//       }
//       catch (err) { mapAPIError(err, 'TwoFactor') }
//     },
//   }
// }
