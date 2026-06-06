import type { Layer } from 'effect'
import { expect, it } from '@effect/vitest'
import { ConfigProvider, Effect } from 'effect'
import nodemailer from 'nodemailer'
import { vi } from 'vitest'
import { EmailService } from './index'
import { emailServiceFromTransporter, fromEnv } from './smtp'

/** Replace the active ConfigProvider with an explicit env map for isolation. */
function withConfig(env: Record<string, string>): Layer.Layer<never> {
  return ConfigProvider.layer(ConfigProvider.fromEnv({ env }))
}

it.effect('applies the default from when input.from is absent', () =>
  Effect.gen(function* () {
    const transporter = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(transporter, 'sendMail')
    const svc = emailServiceFromTransporter(transporter, 'noreply@czo.test')

    yield* svc.send({ to: 'u@x.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' })

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@czo.test',
      to: 'u@x.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      text: 'hi',
    }))
  }))

it.effect('honors an explicit input.from over the default', () =>
  Effect.gen(function* () {
    const transporter = nodemailer.createTransport({ jsonTransport: true })
    const spy = vi.spyOn(transporter, 'sendMail')
    const svc = emailServiceFromTransporter(transporter, 'noreply@czo.test')

    yield* svc.send({ to: 'u@x.com', subject: 'Hi', html: '<p>hi</p>', from: 'custom@czo.test' })

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'custom@czo.test' }))
  }))

it.effect('fromEnv defaults to the logging transport (no SMTP connection)', () =>
  Effect.gen(function* () {
    const svc = yield* EmailService
    yield* svc.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>' })
  }).pipe(
    Effect.provide(fromEnv),
    Effect.provide(withConfig({ EMAIL_TRANSPORT: 'logging' })),
  ))

it.effect('fromEnv with EMAIL_TRANSPORT=smtp and no SMTP_HOST fails with a ConfigError', () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      Effect.gen(function* () { yield* EmailService }).pipe(
        Effect.provide(fromEnv),
        Effect.provide(withConfig({ EMAIL_TRANSPORT: 'smtp' })),
      ),
    )
    expect(exit._tag).toBe('Failure')
  }))
