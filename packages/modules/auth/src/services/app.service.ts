import type { authRelations } from '@czo/auth/relations'
import type { Database, GlobalIDFilterInput, StringFilterInput } from '@czo/kit/db'
import type { ConnectionArgs, PaginateResult } from '@czo/kit/graphql'
import type { AnyColumn, InferSelectModel, SQL } from 'drizzle-orm'
import type { ApiKeyService } from './apiKey.service'
import type { AuthService } from './auth.service'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import * as schema from '@czo/auth/schema'
import { applyGlobalIdFilter, applyStringFilter, Repository } from '@czo/kit/db'
import { decodeCursor, encodeCursor } from '@czo/kit/graphql'
import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm'
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

export interface AppWhereInput {
  status?: StringFilterInput
  organizationId?: GlobalIDFilterInput
}

// ─── Repository ──────────────────────────────────────────────────────

class AppRepository extends Repository<AppSchema, Relations, typeof apps, 'apps'> {}

// ─── Factory ─────────────────────────────────────────────────────────

export function createAppService(
  db: Database,
  apiKeyService: ApiKeyService,
  authService: AuthService,
  baseSubscribableEvents: ReadonlySet<string>,
) {
  const manifestSchema = buildManifestSchema(baseSubscribableEvents)
  const repo = new AppRepository(db, 'apps')

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

    const row = await repo.create({
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
      organizationId: input.organizationId,
      webhookSecret,
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

  async function uninstall(appId: string): Promise<AppRow> {
    const result = await repo.delete({
      where: eq(apps.appId, appId),
    })

    if (!result || result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId })

    return result[0]!
  }

  async function getApp(appId: string): Promise<AppRow | null> {
    return repo.findFirst({
      where: { appId },
    })
  }

  async function getAppById(id: string): Promise<AppRow | null> {
    return repo.findFirst({
      where: { id },
    })
  }

  const ORDER_FIELD_MAP: Record<string, AnyColumn> = {
    CREATED_AT: apps.createdAt,
    APP_ID: apps.appId,
    STATUS: apps.status,
  }

  async function listApps(
    connectionArgs?: ConnectionArgs,
    orderBy?: { field: string, direction: string },
    where?: AppWhereInput,
  ): Promise<PaginateResult<AppRow>> {
    // 1. Resolve sort column and direction
    const sortCol = ORDER_FIELD_MAP[orderBy?.field ?? 'CREATED_AT'] ?? apps.createdAt
    const sortDir = (orderBy?.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    const isBackward = connectionArgs?.last != null

    // 2. Build base WHERE from filters
    const baseConditions: (SQL | undefined)[] = []
    if (where?.status)
      baseConditions.push(applyStringFilter(apps.status, where.status))
    if (where?.organizationId)
      baseConditions.push(applyGlobalIdFilter(apps.organizationId, where.organizationId))

    // 3. Decode cursor and build keyset WHERE
    const cursor = isBackward ? connectionArgs?.before : connectionArgs?.after
    if (cursor) {
      const decoded = decodeCursor(cursor)
      const cursorSortVal = decoded.sortValue
      const cursorId = decoded.id as string

      // Forward + ASC or Backward + DESC → use >
      // Forward + DESC or Backward + ASC → use <
      const useGt = (sortDir === 'ASC') !== isBackward
      const cmp = useGt ? gt : lt

      baseConditions.push(
        or(
          cmp(sortCol, cursorSortVal),
          and(eq(sortCol, cursorSortVal), cmp(apps.id, cursorId)),
        ),
      )
    }

    // 4. ORDER BY — backward inverts the direction
    const effectiveDir = isBackward
      ? (sortDir === 'ASC' ? desc : asc)
      : (sortDir === 'ASC' ? asc : desc)
    const orderClauses = [effectiveDir(sortCol), effectiveDir(apps.id)]

    // 5. LIMIT
    const limit = (connectionArgs?.first ?? connectionArgs?.last ?? 100) + 1

    // 6. Execute data + count in parallel
    const whereClause = and(...baseConditions.filter(Boolean) as SQL[])
    const baseWhereClause = and(...baseConditions.filter(Boolean).filter((_, i) => !cursor || i < baseConditions.length - 1) as SQL[])

    const [rows, countResult] = await Promise.all([
      db.select().from(apps).where(whereClause).orderBy(...orderClauses).limit(limit),
      db.select({ total: count() }).from(apps).where(baseWhereClause),
    ])
    const total = countResult[0]?.total ?? 0

    // 7. Reverse if backward pagination
    let nodes = rows as AppRow[]
    if (isBackward) {
      nodes = nodes.reverse()
    }

    // 8. Build sort value extractor for cursor
    const sortFieldKey = orderBy?.field ?? 'CREATED_AT'

    return {
      nodes,
      totalCount: total,
      getCursor: (node: AppRow) => {
        const record = node as unknown as Record<string, unknown>
        const sortValue = sortFieldKey === 'CREATED_AT'
          ? (node.createdAt instanceof Date ? node.createdAt.toISOString() : String(node.createdAt))
          : String(record[sortCol.name] ?? record.id)

        return encodeCursor({ sortValue, id: node.id })
      },
    }
  }

  async function updateManifest(appId: string, manifest: AppManifest): Promise<AppRow> {
    const parsed = manifestSchema.parse(manifest)

    const result = await repo.update(
      { manifest: parsed },
      { where: eq(apps.appId, appId) },
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
      { where: eq(apps.appId, appId) },
    )

    if (result.length === 0) {
      throw new Error(`App "${appId}" not found`)
    }

    publishAuthEvent(AUTH_EVENTS.APP_STATUS_CHANGED, { appId, status })

    return result[0]!
  }

  async function getActiveAppsByEvent(event: string): Promise<AppRow[]> {
    const result = await listApps({ first: 100 }, undefined, { status: { eq: 'active' } })
    const activeApps = result.nodes
    return activeApps.filter((app) => {
      const manifest = app.manifest as AppManifest
      return manifest.webhooks.some(w => w.event === event)
    })
  }

  return {
    install,
    installFromUrl,
    uninstall,
    getApp,
    getAppById,
    listApps,
    updateManifest,
    setStatus,
    getActiveAppsByEvent,
  }
}
