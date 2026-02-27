import { defineHandler } from 'nitro/h3'
import { checkRabbitMQHealth } from '@czo/kit/event-bus'
import { useRuntimeConfig } from 'nitro/runtime-config'

export default defineHandler(async () => {
  const { rabbitmq } = useRuntimeConfig()
  const url = rabbitmq?.url

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
