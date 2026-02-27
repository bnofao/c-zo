import type { AppManifest, AppRow, AppService } from '@czo/auth/services'
import { createHmac } from 'node:crypto'
import * as schema from '@czo/auth/schema'
import { useLogger } from '@czo/kit'
import { useDatabase } from '@czo/kit/db'
import { useHookable } from '@czo/kit/event-bus'
import { useContainer } from '@czo/kit/ioc'
import { useQueue, useWorker } from '@czo/kit/queue'
import { eq } from 'drizzle-orm'
import { pickFieldsFromQuery } from './utils'

const QUEUE_NAME = 'auth.webhook-deliver'
const SYNC_TIMEOUT_MS = 5000

export interface WebhookDeliveryJob {
  deliveryId: string
  appId: string
  webhookSecret: string
  targetUrl: string
  event: string
  payload: string
}

export interface SyncWebhookResponse {
  appId: string
  deliveryId: string
  ok: boolean
  status: number
  data: unknown
}

/**
 * Signs the payload with HMAC-SHA256 and POSTs it to the target URL.
 * Returns the response status and body. Throws on network failure.
 */
async function deliverWebhook(
  params: { webhookSecret: string, targetUrl: string, event: string, deliveryId: string, payload: string },
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean, status: number, body: string }> {
  const signature = createHmac('sha256', params.webhookSecret)
    .update(params.payload)
    .digest('hex')

  const res = await fetch(params.targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CZO-Signature': signature,
      'X-CZO-Event': params.event,
      'X-CZO-Delivery': params.deliveryId,
    },
    body: params.payload,
    signal: options?.signal,
  })

  const body = await res.text().catch(() => '')
  return { ok: res.ok, status: res.status, body }
}

function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  }
  catch {
    return body || null
  }
}

function buildPayloadStr(webhook: { query?: string }, payload: unknown): string {
  const filtered = webhook.query
    ? pickFieldsFromQuery(webhook.query, payload)
    : payload
  return JSON.stringify(filtered)
}

async function insertDeliveryRecord(
  db: Awaited<ReturnType<typeof useDatabase>>,
  params: { id: string, appId: string, event: string, payload: string },
): Promise<void> {
  await db.insert(schema.webhookDeliveries).values({
    id: params.id,
    appId: params.appId,
    event: params.event,
    payload: params.payload,
    status: 'pending',
    attempts: 0,
  })
}

/**
 * Delivers a synchronous webhook inline with a timeout. Returns the
 * parsed response so the calling service can use the data.
 */
async function deliverSyncWebhook(
  app: AppRow,
  webhook: AppManifest['webhooks'][number],
  event: string,
  payload: unknown,
  logger: ReturnType<typeof useLogger>,
): Promise<SyncWebhookResponse> {
  const db = await useDatabase()
  const payloadStr = buildPayloadStr(webhook, payload)
  const deliveryId = crypto.randomUUID()

  await insertDeliveryRecord(db, { id: deliveryId, appId: app.id, event, payload: payloadStr })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

  try {
    const result = await deliverWebhook(
      { webhookSecret: app.webhookSecret, targetUrl: webhook.targetUrl, event, deliveryId, payload: payloadStr },
      { signal: controller.signal },
    )

    await db.update(schema.webhookDeliveries)
      .set({
        status: result.ok ? 'delivered' : 'failed',
        attempts: 1,
        lastAttemptAt: new Date(),
        responseCode: result.status,
        responseBody: result.body,
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId))

    if (!result.ok) {
      logger.warn(`Sync webhook to app "${app.appId}" returned ${result.status} for "${event}" (${deliveryId})`)
    }
    else {
      logger.info(`Sync webhook "${event}" delivered to app "${app.appId}" (${deliveryId})`)
    }

    return {
      appId: app.appId,
      deliveryId,
      ok: result.ok,
      status: result.status,
      data: tryParseJson(result.body),
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await db.update(schema.webhookDeliveries)
      .set({
        status: 'failed',
        attempts: 1,
        lastAttemptAt: new Date(),
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId))

    logger.error(`Sync webhook to app "${app.appId}" failed for "${event}" (${deliveryId}): ${message}`)

    return { appId: app.appId, deliveryId, ok: false, status: 0, data: null }
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function registerWebhookDispatcher(): Promise<void> {
  const logger = useLogger('auth:webhook-dispatcher')
  const container = useContainer()
  const bus = await useHookable()

  // ─── Worker: delivers async webhooks with automatic retry ───────────

  const worker = await useWorker<WebhookDeliveryJob>(QUEUE_NAME, async (job) => {
    const { deliveryId, appId, targetUrl, event } = job.data
    const db = await useDatabase()

    const result = await deliverWebhook(job.data)

    await db.update(schema.webhookDeliveries)
      .set({
        status: result.ok ? 'delivered' : 'pending',
        attempts: job.attemptsMade + 1,
        lastAttemptAt: new Date(),
        responseCode: result.status,
        responseBody: result.body,
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId))

    if (!result.ok) {
      throw new Error(`Webhook delivery to ${targetUrl} failed with ${result.status}`)
    }

    logger.info(`Webhook "${event}" delivered to app "${appId}" (${deliveryId})`)
  })

  // ─── Mark delivery as failed when all retries are exhausted ─────────

  worker.on('failed', async (job, err) => {
    if (!job)
      return
    const { deliveryId, appId } = job.data as WebhookDeliveryJob
    const db = await useDatabase()

    await db.update(schema.webhookDeliveries)
      .set({
        status: 'failed',
        attempts: job.attemptsMade,
        lastAttemptAt: new Date(),
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId))

    logger.error(`Webhook delivery "${deliveryId}" to app "${appId}" failed after ${job.attemptsMade} attempt(s): ${err.message}`)
  })

  // ─── Subscriber: wildcard — dispatches async webhooks only ──────────

  bus.subscribe('#', async (domainEvent) => {
    const appService = await container.make('auth:apps') as AppService
    const matchedApps = await appService.getActiveAppsByEvent(domainEvent.type)

    if (matchedApps.length === 0)
      return

    const db = await useDatabase()
    const queue = await useQueue<WebhookDeliveryJob>(QUEUE_NAME)

    for (const app of matchedApps) {
      const manifest = app.manifest as AppManifest
      const webhook = manifest.webhooks.find(w => w.event === domainEvent.type)
      if (!webhook)
        continue

      // Sync webhooks are handled via onPublish hook — skip in event bus subscriber
      if (webhook.asyncEvents === false)
        continue

      const payloadStr = buildPayloadStr(webhook, domainEvent.payload)
      const deliveryId = crypto.randomUUID()

      await insertDeliveryRecord(db, { id: deliveryId, appId: app.id, event: domainEvent.type, payload: payloadStr })

      await queue.add('deliver', {
        deliveryId,
        appId: app.appId,
        webhookSecret: app.webhookSecret,
        targetUrl: webhook.targetUrl,
        event: domainEvent.type,
        payload: payloadStr,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      })

      logger.info(`Webhook job enqueued for app "${app.appId}" event "${domainEvent.type}" (${deliveryId})`)
    }
  })

  // ─── Publish hook: dispatches sync webhooks and returns responses ───

  bus.onPublish(async (domainEvent) => {
    const appService = await container.make('auth:apps') as AppService
    const matchedApps = await appService.getActiveAppsByEvent(domainEvent.type)

    const results: SyncWebhookResponse[] = []

    for (const app of matchedApps) {
      const manifest = app.manifest as AppManifest
      const webhook = manifest.webhooks.find(w => w.event === domainEvent.type && w.asyncEvents === false)
      if (!webhook)
        continue

      const response = await deliverSyncWebhook(app, webhook, domainEvent.type, domainEvent.payload, logger)
      results.push(response)
    }

    return results
  })
}
