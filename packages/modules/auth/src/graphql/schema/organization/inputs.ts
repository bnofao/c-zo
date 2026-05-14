import type { AuthGraphQLShemaBuilder } from '@czo/auth/types'
import z from 'zod'

const slugSchema = z.string().min(3, "Slug must be at least 3 characters").max(50, "Slug is too long").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "Slug must be lowercase and only contain letters, numbers, and hyphens (no trailing/leading hyphens)",
})

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerOrganizationInputs(builder: AuthGraphQLShemaBuilder): void {
  builder.inputType('OrganizationCreateData', {
    // validate: createOrganizationSchema,
    fields: t => ({
      name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()) }),
      slug: t.string({ required: true, validate:  slugSchema }),
      logo: t.string({ validate: z.url() }),
      type: t.string(),
      metadata: t.field({ type: 'JSONObject' }),
    }),
  })

  builder.inputType('OrganizationUpdateData', {
    fields: t => ({
      name: t.string({ validate: z.string().max(255).nullable().optional() }),
      slug: t.string({ validate: slugSchema.optional() }),
      logo: t.string({ validate: z.url().optional() }),
      type: t.string(),
      metadata: t.field({ type: 'JSONObject' }),
    }),
  })

  builder.inputType('OrganizationInvitationData', {
    // validate: createOrgInvitationSchema,
    fields: t => ({
      email: t.string({ required: true, validate: z.email() }),
      role: t.string({ required: true }),
      organizationId: t.id({ required: false }),
      resend: t.boolean({ required: false }),
    }),
  })
}
