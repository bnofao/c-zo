import type { AuthAppInstalledPayload } from '../events/types'
import type { AppService } from '../services/app.service'
import { useLogger } from '@czo/kit'
import { useEventBus } from '@czo/kit/event-bus'
import { useContainer } from '@czo/kit/ioc'
import { useQueue, useWorker } from '@czo/kit/queue'
import { AUTH_EVENTS } from '../events/types'

const QUEUE_NAME = 'auth:app-register'

export async function registerAppConsumer(): Promise<void> {
  const logger = useLogger('auth:app-consumer')
  const container = useContainer()
  const bus = await useEventBus()

  // ─── Worker: processes register jobs with automatic retry ────────────

  const worker = useWorker<AuthAppInstalledPayload>(QUEUE_NAME, async (job) => {
    const { appId, registerUrl, apiKey } = job.data
    const appService = await container.make('auth:apps') as AppService

    const res = await fetch(registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, apiKey }),
    })

    if (!res.ok) {
      throw new Error(`Register endpoint responded with ${res.status}`)
    }

    await appService.setStatus(appId, 'active')
    logger.info(`App "${appId}" registered successfully`)
  })

  // ─── Set status to error when all retries are exhausted ──────────────

  worker.on('failed', async (job, err) => {
    if (!job)
      return
    const { appId } = job.data as AuthAppInstalledPayload
    const appService = await container.make('auth:apps') as AppService
    await appService.setStatus(appId, 'error')
    logger.error(`App "${appId}" registration failed after ${job.attemptsMade} attempt(s): ${err.message}`)
  })

  // ─── Subscriber: enqueues job on auth.app.installed event ────────────

  bus.subscribe(AUTH_EVENTS.APP_INSTALLED, async (event) => {
    const payload = event.payload as AuthAppInstalledPayload
    const queue = useQueue<AuthAppInstalledPayload>(QUEUE_NAME)
    await queue.add('register', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    })
    logger.info(`App "${payload.appId}" register job enqueued`)
  })
}
