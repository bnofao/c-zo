import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).optional(),
  role: z.string().optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
})

export const userWhereSchema = z.object({
  emailVerified: z.boolean().optional(),
  banned: z.boolean().optional(),
})

export const userOrderBySchema = z.object({
  field: z.enum(['name', 'email', 'createdAt']),
  direction: z.enum(['asc', 'desc']),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerUserInputs(builder: any): void {
  builder.inputType('CreateUserInput', {
    validate: { schema: createUserSchema },
    fields: (t: any) => ({
      email: t.string({ required: true }),
      name: t.string({ required: true }),
      password: t.string({ required: false }),
      role: t.string({ required: false }),
    }),
  })

  builder.inputType('UpdateUserInput', {
    validate: { schema: updateUserSchema },
    fields: (t: any) => ({
      name: t.string({ required: false }),
      email: t.string({ required: false }),
    }),
  })

  builder.inputType('UserWhereInput', {
    fields: (t: any) => ({
      emailVerified: t.boolean({ required: false }),
      banned: t.boolean({ required: false }),
    }),
  })

  builder.enumType('UserOrderField', {
    values: {
      NAME: { value: 'name' },
      EMAIL: { value: 'email' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  builder.inputType('UserOrderByInput', {
    fields: (t: any) => ({
      field: t.field({ type: 'UserOrderField', required: true }),
      direction: t.string({ required: true }),
    }),
  })
}
