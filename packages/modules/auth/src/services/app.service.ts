import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { eq, sql } from 'drizzle-orm'
import { Kind, parse } from 'graphql'
import { z } from 'zod'
import { apps, apikeys } from '../database/schema'

// ─── Zod Schema ──────────────────────────────────────────────────────

const webhookSchema = z.object({
  event: z.string(),
  targetUrl: z.string(),
  asyncEvents: z.boolean().optional(),
  query: z.string().optional(),
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

      if (webhook.query) {
        try {
          const doc = parse(webhook.query)
          const firstDef = doc.definitions[0]
          if (!firstDef || firstDef.kind !== Kind.OPERATION_DEFINITION || firstDef.operation !== 'subscription') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Webhook query for event "${webhook.event}" must be a subscription operation.`,
              path: ['webhooks'],
            })
          }
        }
        catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Webhook query for event "${webhook.event}" contains invalid GraphQL syntax.`,
            path: ['webhooks'],
          })
        }
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

// ─── SSRF Protection ─────────────────────────────────────────────────

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
]

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(r => r.test(ip))
}

async function resolveAndValidateUrl(url: string): Promise<{ ip: string, hostname: string, parsed: URL }> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed')
  }

  const dns = await import('node:dns/promises')
  const [ipv4, ipv6] = await Promise.allSettled([
    dns.resolve(parsed.hostname),
    dns.resolve6(parsed.hostname),
  ])

  const addresses = [
    ...(ipv4.status === 'fulfilled' ? ipv4.value : []),
    ...(ipv6.status === 'fulfilled' ? ipv6.value : []),
  ]

  if (addresses.length === 0) {
    throw new Error('URL hostname could not be resolved')
  }

  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new Error('URL resolves to a private address')
    }
  }

  return { ip: addresses[0]!, hostname: parsed.hostname, parsed }
}

async function safeFetch(url: string): Promise<Response> {
  const { ip, hostname, parsed } = await resolveAndValidateUrl(url)
  const ipUrl = new URL(parsed.href)
  ipUrl.hostname = ip
  return fetch(ipUrl.href, { headers: { Host: hostname } })
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createAppService(db: Database, subscribableEvents: ReadonlySet<string> = new Set()) {
  const manifestSchema = buildManifestSchema(subscribableEvents)

  return {
    // ── Reads ──

    async find(id: string) {
      const [row] = await db.select().from(apps).where(eq(apps.id, id)).limit(1)
      return row ?? null
    },

    async findByAppId(appId: string) {
      const [row] = await db.select().from(apps).where(eq(apps.appId, appId)).limit(1)
      return row ?? null
    },

    async findBySlug(slug: string) {
      const [row] = await db.select().from(apps).where(eq(apps.appId, slug)).limit(1)
      return row ?? null
    },

    async list() {
      return db.select().from(apps)
    },

    async findManyByEvent(event: string) {
      return db
        .select()
        .from(apps)
        .where(
          sql`${apps.status} = 'active' AND ${apps.manifest}->'webhooks' @> ${JSON.stringify([{ event }])}::jsonb`,
        )
        .limit(100)
    },

    // ── Writes ──

    async install(
      input: InstallAppInput,
      apiKeyService: { create: (input: { name: string, userId: string, prefix: string, permissions: Record<string, string[]> }) => Promise<{ id: string, key: string }> },
    ): Promise<InstalledApp> {
      const manifest = manifestSchema.parse(input.manifest)

      if (manifest.scope === 'organization' && !input.organizationId) {
        throw new Error(`App "${manifest.id}" requires an organization context but no organizationId was provided`)
      }

      const existing = await this.findByAppId(manifest.id)
      if (existing) {
        throw new Error(`App "${manifest.id}" is already installed`)
      }

      const id = crypto.randomUUID()
      const webhookSecret = crypto.randomUUID()
      const now = new Date()

      const [row] = await db.insert(apps).values({
        id,
        appId: manifest.id,
        manifest,
        status: 'pending',
        webhookSecret,
        installedBy: input.installedBy,
        organizationId: input.organizationId,
        createdAt: now,
        updatedAt: now,
      }).returning()

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

      await publishAuthEvent(AUTH_EVENTS.APP_INSTALLED, {
        appId: manifest.id,
        registerUrl: manifest.register,
        apiKey: apiKey.key,
        installedBy: input.installedBy,
        organizationId: input.organizationId,
        webhookSecret,
      })

      return { ...row, apiKey: { id: apiKey.id } }
    },

    async installFromUrl(
      url: string,
      userId: string,
      apiKeyService: { create: (input: { name: string, userId: string, prefix: string, permissions: Record<string, string[]> }) => Promise<{ id: string, key: string }> },
      organizationId?: string,
    ): Promise<InstalledApp> {
      const response = await safeFetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest from ${url}: ${response.status}`)
      }
      const json = await response.json()
      const manifest = manifestSchema.parse(json)
      return this.install({ manifest, installedBy: userId, organizationId }, apiKeyService)
    },

    async uninstall(appId: string) {
      const [result] = await db
        .delete(apps)
        .where(eq(apps.appId, appId))
        .returning()

      if (!result) {
        throw new Error(`App "${appId}" not found`)
      }

      await publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId })
      return result
    },

    async updateManifest(id: string, manifest: unknown) {
      const parsed = manifestSchema.parse(manifest)
      const [result] = await db
        .update(apps)
        .set({ manifest: parsed, updatedAt: new Date() })
        .where(eq(apps.id, id))
        .returning()

      if (!result) {
        throw new Error(`App "${id}" not found`)
      }

      await publishAuthEvent(AUTH_EVENTS.APP_UPDATED, {
        appId: result.appId,
        version: parsed.version,
        status: result.status,
      })
      return result
    },

    async setStatus(id: string, status: AppStatus) {
      const [result] = await db
        .update(apps)
        .set({ status, updatedAt: new Date() })
        .where(eq(apps.id, id))
        .returning()

      if (!result) {
        throw new Error(`App "${id}" not found`)
      }

      await publishAuthEvent(AUTH_EVENTS.APP_UPDATED, {
        appId: result.appId,
        version: (result.manifest as AppManifest)?.version ?? '',
        status,
      })
      return result
    },
  }
}
