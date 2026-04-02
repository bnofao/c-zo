import type { authRelations } from '@czo/auth/relations'
import type { Database } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import * as schema from '@czo/auth/schema'
import { Repository } from '@czo/kit/db'
import { useContainer } from '@czo/kit/ioc'
import { eq, sql } from 'drizzle-orm'
import { Kind, parse } from 'graphql'
import { z } from 'zod'

const { apps, apikeys } = schema

// ─── Schema type for the repository ─────────────────────────────────

type AppSchema = typeof schema
type Relations = ReturnType<typeof authRelations>

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
  /^127\./, // loopback
  /^10\./, // class A
  /^172\.(1[6-9]|2\d|3[01])\./, // class B
  /^192\.168\./, // class C
  /^169\.254\./, // link-local / cloud metadata
  /^0\./, // current network
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
  /^::1$/, // IPv6 loopback
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

  // Rewrite URL to use the resolved IP, set Host header to original hostname.
  // This prevents DNS rebinding: the fetch connects to the verified IP,
  // not a potentially different re-resolution of the hostname.
  const ipUrl = new URL(parsed.href)
  ipUrl.hostname = ip

  return fetch(ipUrl.href, {
    headers: { Host: hostname },
  })
}

// ─── Repository ──────────────────────────────────────────────────────

class AppRepository extends Repository<AppSchema, Relations, typeof apps, 'apps'> {
  #manifestSchema: ReturnType<typeof buildManifestSchema>

  constructor(db: Database, events: ReadonlySet<string>) {
    super(db)
    this.#manifestSchema = buildManifestSchema(events)
  }

  get model() {
    return 'apps' as const
  }

  async beforeUpdate(value: any) {
    if ('manifest' in value) {
      value.manifest = this.#manifestSchema.parse(value.manifest)
    }
  }

  async afterUpdate(value: any) {
    publishAuthEvent(AUTH_EVENTS.APP_UPDATED, { appId: value.appId, version: value.manifest.version, status: value.status })
  }

  async install(input: InstallAppInput): Promise<InstalledApp> {
    const manifest = this.#manifestSchema.parse(input.manifest)
    const authService = await useContainer().make('auth:service')
    const apiKeyService = await useContainer().make('auth:apikeys')

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
      this.findFirst({
        where: { appId: manifest.id },
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
    const webhookSecret = crypto.randomUUID()
    const now = new Date()

    const row = await this.create({
      id,
      appId: manifest.id,
      manifest,
      status: 'pending',
      webhookSecret,
      installedBy: input.installedBy,
      organizationId: input.organizationId,
      createdAt: now,
      updatedAt: now,
    })

    if (!row || row.length === 0) {
      throw new Error('Failed to insert app')
    }

    const apiKey = await apiKeyService.create({
      name: `app:${manifest.id}`,
      userId: input.installedBy,
      prefix: 'app_',
      permissions: manifest.permissions,
    })

    // TODO: Use apiKeyService to update
    await this.db
      .update(apikeys)
      .set({ installedAppId: id })
      .where(eq(apikeys.id, apiKey.id))

    publishAuthEvent(AUTH_EVENTS.APP_INSTALLED, {
      appId: manifest.id,
      registerUrl: manifest.register,
      apiKey: apiKey.key,
      installedBy: input.installedBy,
      organizationId: input.organizationId,
      webhookSecret,
    })

    return { ...row[0], apiKey: { id: apiKey.id } } as InstalledApp
  }

  async installFromUrl(url: string, userId: string, organizationId?: string): Promise<InstalledApp> {
    const response = await safeFetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest from ${url}: ${response.status}`)
    }

    const json = await response.json()
    const manifest = this.#manifestSchema.parse(json)

    return this.install({ manifest, installedBy: userId, organizationId })
  }

  async uninstall(appId: string): Promise<AppRow> {
    const result = await this.delete({
      where: eq(apps.appId, appId),
    })

    if (!result || result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId })

    return result[0]!
  }

  async findManyByEvent(event: string) {
    return await this.findMany({
      where: {
        status: 'active',
        RAW: table => sql`${table.manifest}->'webhooks' @> ${JSON.stringify([{ event }])}::jsonb`,
      },
      limit: 100,
    })
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export const createAppService = (db: Database, events: ReadonlySet<string>) => AppRepository.buildService([db, events])
