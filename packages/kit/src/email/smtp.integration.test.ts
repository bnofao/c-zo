import type { StartedTestContainer } from 'testcontainers'
import { expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll } from 'vitest'
import { EmailService } from './index'
import { smtpLayer } from './smtp'

let container: StartedTestContainer
let host: string
let smtpPort: number
let apiPort: number

beforeAll(async () => {
  container = await new GenericContainer('axllent/mailpit:v1.21')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()
  host = container.getHost()
  smtpPort = container.getMappedPort(1025)
  apiPort = container.getMappedPort(8025)
}, 120_000)

afterAll(async () => {
  await container?.stop()
})

it.effect('smtpLayer delivers a message to Mailpit over real SMTP', () =>
  Effect.gen(function* () {
    const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({
      env: {
        SMTP_HOST: host,
        SMTP_PORT: String(smtpPort),
        SMTP_SECURE: 'false',
        EMAIL_FROM: 'noreply@czo.test',
      },
    }))

    yield* Effect.gen(function* () {
      const svc = yield* EmailService
      yield* svc.send({ to: 'rcpt@czo.test', subject: 'B10 hello', html: '<p>hi</p>' })
    }).pipe(Effect.provide(smtpLayer), Effect.provide(configLayer))

    const res = yield* Effect.promise(() => fetch(`http://${host}:${apiPort}/api/v1/messages`))
    const body = yield* Effect.promise(() => res.json() as Promise<{ messages: Array<{ Subject: string }> }>)

    expect(body.messages.length).toBeGreaterThanOrEqual(1)
    expect(body.messages.some(m => m.Subject === 'B10 hello')).toBe(true)
  }), 120_000)
