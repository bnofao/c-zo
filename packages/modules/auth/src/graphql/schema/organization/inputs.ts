import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[\w-]+$/, 'Slug must be URL-safe'),
  logo: z.string().url().optional(),
  type: z.string().optional(),
  keepCurrentActiveOrganization: z.boolean().optional(),
})

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(100).regex(/^[\w-]+$/, 'Slug must be URL-safe').optional(),
  logo: z.string().url().optional(),
  type: z.string().optional(),
})

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.string(),
  organizationId: z.string().optional(),
  resend: z.boolean().optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerOrganizationInputs(builder: any): void {
  builder.inputType('CreateOrganizationInput', {
    fields: (t: any) => ({
      name: t.string({ required: true }),
      slug: t.string({ required: true }),
      logo: t.string({ required: false }),
      type: t.string({ required: false }),
      keepCurrentActiveOrganization: t.boolean({ required: false }),
    }),
  })

  builder.inputType('UpdateOrganizationInput', {
    fields: (t: any) => ({
      name: t.string({ required: false }),
      slug: t.string({ required: false }),
      logo: t.string({ required: false }),
      type: t.string({ required: false }),
    }),
  })

  builder.inputType('InviteMemberInput', {
    fields: (t: any) => ({
      email: t.string({ required: true }),
      role: t.string({ required: true }),
      organizationId: t.id({ required: false }),
      resend: t.boolean({ required: false }),
    }),
  })
}
