import { z } from 'zod'

// ─── Zod schemas (exported for service-layer validation) ─────────────────────

export const installAppSchema = z.object({
  manifestUrl: z.string().url(),
  organizationId: z.string().optional(),
})

export const installAppManifestSchema = z.object({
  manifest: z.record(z.unknown()),
  organizationId: z.string().optional(),
  installedBy: z.string(),
})

export const updateAppManifestSchema = z.object({
  appId: z.string(),
  manifest: z.record(z.unknown()),
})

export const setAppStatusSchema = z.object({
  appId: z.string(),
  status: z.enum(['active', 'inactive', 'suspended']),
})

export const appWhereSchema = z.object({
  status: z.string().optional(),
  organizationId: z.string().optional(),
})

export const appOrderBySchema = z.object({
  field: z.enum(['CREATED_AT', 'APP_ID', 'STATUS']),
  dir: z.enum(['asc', 'desc']),
})

export type InstallAppInput = z.infer<typeof installAppSchema>
export type UpdateAppManifestInput = z.infer<typeof updateAppManifestSchema>
export type SetAppStatusInput = z.infer<typeof setAppStatusSchema>

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerAppInputs(builder: any): void {
  builder.enumType('AppOrderField', {
    values: {
      CREATED_AT: { value: 'CREATED_AT' },
      APP_ID: { value: 'APP_ID' },
      STATUS: { value: 'STATUS' },
    } as const,
  })

  builder.inputType('InstallAppInput', {
    fields: (t: any) => ({
      manifestUrl: t.string({ required: true }),
      organizationId: t.id({ required: false }),
    }),
  })

  builder.inputType('UpdateAppManifestInput', {
    fields: (t: any) => ({
      appId: t.string({ required: true }),
    }),
  })

  builder.inputType('SetAppStatusInput', {
    fields: (t: any) => ({
      appId: t.string({ required: true }),
      status: t.string({ required: true }),
    }),
  })

  builder.inputType('AppWhereInput', {
    fields: (t: any) => ({
      status: t.string({ required: false }),
      organizationId: t.id({ required: false }),
    }),
  })

  builder.inputType('AppOrderByInput', {
    fields: (t: any) => ({
      field: t.field({ type: 'AppOrderField', required: true }),
      dir: t.string({ required: true }),
    }),
  })
}
