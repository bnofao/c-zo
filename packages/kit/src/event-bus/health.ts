import amqplib from 'amqplib'

export interface RabbitMQHealthResult {
  readonly status: 'ok' | 'error'
  readonly latencyMs: number
  readonly error?: string
}

/**
 * Lightweight RabbitMQ connectivity probe.
 *
 * Opens a short-lived connection to verify the broker is reachable,
 * then immediately closes it. Does not interfere with the singleton EventBus.
 */
export async function checkRabbitMQHealth(url: string): Promise<RabbitMQHealthResult> {
  const start = Date.now()
  try {
    const connection = await amqplib.connect(url)
    await connection.close()
    return { status: 'ok', latencyMs: Date.now() - start }
  }
  catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
