import type { Transporter } from 'nodemailer'
import type { SendEmailInput } from './index'
import { Config, Effect, Layer, Redacted } from 'effect'
import nodemailer from 'nodemailer'
import { EmailSendFailed, EmailService, loggingLayer } from './index'

/**
 * Pure factory: adapt a nodemailer `Transporter` to an `EmailService` impl.
 * Maps `SendEmailInput → transporter.sendMail`, applying `defaultFrom` when the
 * caller omits `from`, and mapping any send rejection → `EmailSendFailed`.
 * Decoupled from Config/transport creation so it can be unit-tested against an
 * in-memory transport.
 */
export function emailServiceFromTransporter(
  transporter: Transporter,
  defaultFrom: string,
): { readonly send: (input: SendEmailInput) => Effect.Effect<void, EmailSendFailed> } {
  return {
    send: input =>
      Effect.tryPromise({
        try: () => transporter.sendMail({
          from: input.from ?? defaultFrom,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        catch: cause => new EmailSendFailed({ cause }),
      }).pipe(Effect.asVoid),
  }
}

/** SMTP transport config, read from the environment via Effect `Config`. */
const smtpConfig = Effect.gen(function* () {
  const host = yield* Config.string('SMTP_HOST')
  const port = yield* Config.int('SMTP_PORT').pipe(Config.withDefault(587))
  const secure = yield* Config.boolean('SMTP_SECURE').pipe(Config.withDefault(false))
  const user = yield* Config.string('SMTP_USER').pipe(Config.withDefault(''))
  const password = yield* Config.redacted('SMTP_PASSWORD').pipe(Config.withDefault(Redacted.make('')))
  const from = yield* Config.string('EMAIL_FROM')
  return { host, port, secure, user, pass: Redacted.value(password), from }
})

/**
 * Real SMTP transport. Reads `smtpConfig`, creates a pooled nodemailer
 * transporter as a scoped resource (closed on scope release), and yields the
 * `EmailService` impl. `auth` is set only when both user and password are
 * present (some relays are IP-allowlisted and need none).
 */
export const smtpLayer: Layer.Layer<EmailService, Config.ConfigError> = Layer.unwrap(
  smtpConfig.pipe(Effect.map((cfg) => {
    const auth = cfg.user !== '' && cfg.pass !== '' ? { user: cfg.user, pass: cfg.pass } : undefined
    return Layer.effect(
      EmailService,
      Effect.acquireRelease(
        Effect.sync(() => nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth,
          pool: true,
        })),
        transporter => Effect.sync(() => transporter.close()),
      ).pipe(Effect.map(transporter => emailServiceFromTransporter(transporter, cfg.from))),
    )
  })),
)

/**
 * Env-selected transport: `EMAIL_TRANSPORT=smtp` → `smtpLayer`, anything else
 * (default `logging`) → `loggingLayer`. This is the layer the host app merges
 * into `buildApp({ services })`.
 */
export const fromEnv: Layer.Layer<EmailService, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const transport = yield* Config.string('EMAIL_TRANSPORT').pipe(Config.withDefault('logging'))
    return transport === 'smtp' ? smtpLayer : loggingLayer
  }),
)
