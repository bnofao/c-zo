import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  revokeOtherSessions: z.boolean().optional(),
})

export const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  callbackURL: z.string().url().optional(),
})

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  image: z.string().url().optional(),
})

export const deleteAccountSchema = z.object({
  password: z.string().optional(),
  callbackURL: z.string().url().optional(),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerAccountInputs(builder: any): void {
  builder.inputType('ChangePasswordInput', {
    fields: (t: any) => ({
      currentPassword: t.string({ required: true }),
      newPassword: t.string({ required: true }),
      revokeOtherSessions: t.boolean({ required: false }),
    }),
  })

  builder.inputType('ChangeEmailInput', {
    fields: (t: any) => ({
      newEmail: t.string({ required: true }),
      callbackURL: t.string({ required: false }),
    }),
  })

  builder.inputType('UpdateProfileInput', {
    fields: (t: any) => ({
      name: t.string({ required: false }),
      image: t.string({ required: false }),
    }),
  })

  builder.inputType('DeleteAccountInput', {
    fields: (t: any) => ({
      password: t.string({ required: false }),
      callbackURL: t.string({ required: false }),
    }),
  })
}
