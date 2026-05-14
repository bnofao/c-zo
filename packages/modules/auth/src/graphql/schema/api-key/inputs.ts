import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  expiresIn: z.number().int().positive().optional(),
  prefix: z.string().max(16).optional(),
  remaining: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  refillAmount: z.number().int().positive().optional(),
  refillInterval: z.number().int().positive().optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitTimeWindow: z.number().int().positive().optional(),
  rateLimitMax: z.number().int().positive().optional(),
})

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  remaining: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  expiresIn: z.number().int().positive().optional(),
  refillAmount: z.number().int().positive().optional(),
  refillInterval: z.number().int().positive().optional(),
  rateLimitEnabled: z.boolean().optional(),
  rateLimitTimeWindow: z.number().int().positive().optional(),
  rateLimitMax: z.number().int().positive().optional(),
})

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerApiKeyInputs(builder: any): void {
  builder.inputType('CreateApiKeyInput', {
    validate: { schema: createApiKeySchema },
    fields: (t: any) => ({
      name: t.string({ required: true }),
      expiresIn: t.int({ required: false }),
      prefix: t.string({ required: false }),
      remaining: t.int({ required: false }),
      refillAmount: t.int({ required: false }),
      refillInterval: t.int({ required: false }),
      rateLimitEnabled: t.boolean({ required: false }),
      rateLimitTimeWindow: t.int({ required: false }),
      rateLimitMax: t.int({ required: false }),
    }),
  })

  builder.inputType('UpdateApiKeyInput', {
    validate: { schema: updateApiKeySchema },
    fields: (t: any) => ({
      name: t.string({ required: false }),
      enabled: t.boolean({ required: false }),
      remaining: t.int({ required: false }),
      expiresIn: t.int({ required: false }),
      refillAmount: t.int({ required: false }),
      refillInterval: t.int({ required: false }),
      rateLimitEnabled: t.boolean({ required: false }),
      rateLimitTimeWindow: t.int({ required: false }),
      rateLimitMax: t.int({ required: false }),
    }),
  })
}
