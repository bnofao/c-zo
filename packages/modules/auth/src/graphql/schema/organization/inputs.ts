import type { AuthGraphQLSchemaBuilder } from '../..'
import z from 'zod'

const slugSchema = z.string().min(3, 'Slug must be at least 3 characters').max(50, 'Slug is too long').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Slug must be lowercase and only contain letters, numbers, and hyphens (no trailing/leading hyphens)',
})

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerOrganizationInputs(builder: AuthGraphQLSchemaBuilder): void {
  builder.inputType('OrganizationCreateData', {
    description: 'The fields required to create a new organization.',
    // validate: createOrganizationSchema,
    fields: t => ({
      name: t.string({ required: true, validate: z.string().max(255).min(1).transform(name => name.trim()), description: 'The display name for the new organization.' }),
      slug: t.string({ required: true, validate: slugSchema, description: 'The unique URL-safe identifier for the organization; lowercase letters, numbers, and hyphens only.' }),
      logo: t.string({ validate: z.url(), description: 'The URL of the organization\'s logo image.' }),
      type: t.string({ description: 'An optional caller-defined classification of the organization.' }),
      metadata: t.field({ type: 'JSONObject', description: 'Arbitrary JSON metadata to attach to the organization.' }),
    }),
  })

  builder.inputType('OrganizationUpdateData', {
    description: 'The fields that may be changed when updating an existing organization; omitted fields are left unchanged.',
    fields: t => ({
      name: t.string({ validate: z.string().max(255).nullable().optional(), description: 'The new display name for the organization.' }),
      slug: t.string({ validate: slugSchema.optional(), description: 'The new unique URL-safe identifier for the organization.' }),
      logo: t.string({ validate: z.url().optional(), description: 'The new URL of the organization\'s logo image.' }),
      type: t.string({ description: 'The new caller-defined classification of the organization.' }),
      metadata: t.field({ type: 'JSONObject', description: 'The new arbitrary JSON metadata to attach to the organization.' }),
    }),
  })

  builder.inputType('OrganizationInvitationData', {
    description: 'The fields required to invite a user to join an organization.',
    // validate: createOrgInvitationSchema,
    fields: t => ({
      email: t.string({ required: true, validate: z.email(), description: 'The email address to send the invitation to.' }),
      role: t.string({ required: true, description: 'The role the recipient will be granted upon accepting the invitation.' }),
      organizationId: t.id({ required: false, description: 'The identifier of the organization to invite the recipient to.' }),
      resend: t.boolean({ required: false, description: 'Whether to resend the invitation if one already exists for this email.' }),
    }),
  })
}
