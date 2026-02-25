import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { ApiKeyService } from './apiKey.service'
import type { AuthService } from './auth.service'
import { Repository } from '@czo/kit/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../database/schema'
import { publishAuthEvent } from '../events/auth-events'
import { AUTH_EVENTS } from '../events/types'

const { apps, apikeys } = schema

// ─── Schema type for the repository ─────────────────────────────────

type AppSchema = typeof schema

// ─── Zod Schema ──────────────────────────────────────────────────────

const webhookSchema = z.object({
  event: z.string(),
  targetUrl: z.string(),
  asyncEvents: z.boolean().optional(),
})

const authorSchema = z.object({
  name: z.string(),
  url: z.string().url().optional(),
  supportUrl: z.string().url().optional(),
  privacyUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
})

export const appManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  about: z.string().optional(),
  appUrl: z.string().url(),
  register: z.string().url(),
  author: authorSchema.optional(),
  scope: z.enum(['organization', 'user']).default('organization'),
  permissions: z.record(z.string(), z.array(z.string())),
  webhooks: z.array(webhookSchema),
})

function buildManifestSchema(subscribableEvents: ReadonlySet<string>) {
  return appManifestSchema.superRefine((data, ctx) => {
    const permissionKeys = Object.keys(data.permissions)
    for (const webhook of data.webhooks) {
      const allowed
        = subscribableEvents.has(webhook.event)
          || permissionKeys.some(key => webhook.event.startsWith(`${key}.`))
      if (!allowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Event "${webhook.event}" is not allowed. Declare the corresponding resource in permissions (e.g. "${webhook.event.split('.')[0]}") or use a base subscribable event.`,
          path: ['webhooks'],
        })
      }
    }
  })
}

// ─── Types ───────────────────────────────────────────────────────────

export type AppManifest = z.infer<typeof appManifestSchema>
export type AppRow = InferSelectModel<typeof apps>
export type AppStatus = 'active' | 'disabled' | 'error'

export interface InstallAppInput {
  manifest: AppManifest
  installedBy: string
  installerRole?: string
  organizationId?: string
}

export interface InstalledApp extends AppRow {
  apiKey?: { id: string }
}

export type AppService = ReturnType<typeof createAppService>

// ─── Repository ──────────────────────────────────────────────────────

class AppRepository extends Repository<AppSchema, typeof apps, 'apps'> {}

// ─── Factory ─────────────────────────────────────────────────────────

export function createAppService(
  db: Database<AppSchema>,
  apiKeyService: ApiKeyService,
  authService: AuthService,
  baseSubscribableEvents: ReadonlySet<string>,
) {
  const manifestSchema = buildManifestSchema(baseSubscribableEvents)
  const repo = new AppRepository(db, apps)

  async function install(input: InstallAppInput): Promise<InstalledApp> {
    const manifest = manifestSchema.parse(input.manifest)

    if (manifest.scope === 'organization' && !input.organizationId) {
      throw new Error(`App "${manifest.id}" requires an organization context but no organizationId was provided`)
    }

    const [allowed, existing] = await Promise.all([
      Object.keys(manifest.permissions).length > 0
        ? authService.hasPermission(
            { userId: input.installedBy, organizationId: input.organizationId },
            manifest.permissions,
            input.installerRole,
          )
        : Promise.resolve(true),
      repo.findFirst({
        where: (columns, { eq: colEq }) => colEq(columns.appId, manifest.id),
      }),
    ])

    if (!allowed) {
      const requested = Object.entries(manifest.permissions)
        .map(([resource, actions]) => `${resource}:${actions.join(',')}`)
        .join('; ')
      throw new Error(`Installer does not have the required permissions to install this app (requested: ${requested})`)
    }

    if (existing) {
      throw new Error(`App "${manifest.id}" is already installed`)
    }

    const id = crypto.randomUUID()
    const now = new Date()

    const row = await repo.create({
      id,
      appId: manifest.id,
      manifest,
      status: 'pending',
      installedBy: input.installedBy,
      createdAt: now,
      updatedAt: now,
    })

    if (!row) {
      throw new Error('Failed to insert app')
    }

    const apiKey = await apiKeyService.create({
      name: `app:${manifest.id}`,
      userId: input.installedBy,
      prefix: 'app_',
      permissions: manifest.permissions,
    })

    await db
      .update(apikeys)
      .set({ installedAppId: id })
      .where(eq(apikeys.id, apiKey.id))

    publishAuthEvent(AUTH_EVENTS.APP_INSTALLED, {
      appId: manifest.id,
      registerUrl: manifest.register,
      apiKey: apiKey.key,
      installedBy: input.installedBy,
    })

    return { ...row, apiKey: { id: apiKey.id } }
  }

  async function installFromUrl(url: string, userId: string, organizationId?: string): Promise<InstalledApp> {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest from ${url}: ${response.status}`)
    }

    const json = await response.json()
    const manifest = manifestSchema.parse(json)

    return install({ manifest, installedBy: userId, organizationId })
  }

  async function uninstall(appId: string): Promise<void> {
    const result = await repo.delete({
      where: (columns, { eq: colEq }) => colEq(columns.appId, appId),
    })

    if (!result || result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId })
  }

  async function getApp(appId: string): Promise<AppRow | null> {
    return repo.findFirst({
      where: (columns, { eq: colEq }) => colEq(columns.appId, appId),
    })
  }

  async function listApps(): Promise<AppRow[]> {
    return repo.findMany({
      where: (columns, { eq: colEq }) => colEq(columns.status, 'active'),
    })
  }

  async function updateManifest(appId: string, manifest: AppManifest): Promise<AppRow> {
    const parsed = manifestSchema.parse(manifest)

    const result = await repo.update(
      { manifest: parsed },
      { where: (columns, { eq: colEq }) => colEq(columns.appId, appId) },
    )

    if (result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_MANIFEST_UPDATED, { appId, version: parsed.version })

    return result[0]!
  }

  async function setStatus(appId: string, status: AppStatus): Promise<AppRow> {
    const result = await repo.update(
      { status },
      { where: (columns, { eq: colEq }) => colEq(columns.appId, appId) },
    )

    if (result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_STATUS_CHANGED, { appId, status })

    return result[0]!
  }

  return {
    install,
    installFromUrl,
    uninstall,
    getApp,
    listApps,
    updateManifest,
    setStatus,
  }
}
