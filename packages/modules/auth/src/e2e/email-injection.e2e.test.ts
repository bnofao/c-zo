import type { SendEmailInput } from '@czo/kit/email'
import { EmailService } from '@czo/kit/email'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootAuthApp } from './harness'

// Capturing transport: records every send so the test can assert the auth
// subscriber chain (SignedUp → EmailVerificationRequested → sendEmail) reached
// a host-provided EmailService injected via buildApp({ services }).
const sent: SendEmailInput[] = []
const capturingEmail = Layer.succeed(EmailService, {
  send: (input: SendEmailInput) => Effect.sync(() => { sent.push(input) }),
})

async function waitFor<T>(get: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const v = get()
    if (v !== undefined)
      return v

    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('timed out waiting for captured email')
}

describe('email injection (E2E)', () => {
  let h: Awaited<ReturnType<typeof bootAuthApp>>
  beforeAll(async () => {
    h = await bootAuthApp({ services: capturingEmail })
  }, 120_000)
  afterAll(() => h.close())

  it('delivers the sign-up verification email through the injected EmailService', async () => {
    await h.signUp('inject-me@ex.com', 'U', 'password123!')

    const verify = await waitFor(() =>
      sent.find(e => e.to === 'inject-me@ex.com' && e.subject === 'Verify your email'))

    expect(verify).toBeTruthy()
    expect(verify!.html).toContain('verify-email?token=')
  })
})
