import { defineHandler } from 'nitro/h3'
import { checkRabbitMQHealth } from '@czo/kit/event-bus'
import { useCzoConfig } from '@czo/kit'

export default defineHandler(async () => {
  const { eventBus } = useCzoConfig()
  const url = eventBus.rabbitmq?.url

  if (!url) {
    return {
      status: 'skipped',
      message: 'RabbitMQ is not configured',
    }
  }

  const result = await checkRabbitMQHealth(url)

  return {
    status: result.status,
    latencyMs: result.latencyMs,
    ...(result.error ? { error: result.error } : {}),
  }
})
