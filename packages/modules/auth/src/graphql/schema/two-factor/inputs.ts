import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const verifyTotpSchema = z.object({
  code: z.string().min(6).max(6),
  trustDevice: z.boolean().optional(),
})

export const verifyOtpSchema = z.object({
  code: z.string().min(1),
  trustDevice: z.boolean().optional(),
})

export const verifyBackupCodeSchema = z.object({
  code: z.string().min(1),
  disableSession: z.boolean().optional(),
  trustDevice: z.boolean().optional(),
})

export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerTwoFactorInputs(builder: any): void {
  builder.inputType('VerifyTotpInput', {
    fields: (t: any) => ({
      code: t.string({ required: true }),
      trustDevice: t.boolean({ required: false }),
    }),
  })

  builder.inputType('VerifyOtpInput', {
    fields: (t: any) => ({
      code: t.string({ required: true }),
      trustDevice: t.boolean({ required: false }),
    }),
  })

  builder.inputType('VerifyBackupCodeInput', {
    fields: (t: any) => ({
      code: t.string({ required: true }),
      disableSession: t.boolean({ required: false }),
      trustDevice: t.boolean({ required: false }),
    }),
  })
}
