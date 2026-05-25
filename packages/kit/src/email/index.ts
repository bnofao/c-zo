import { Context, Data, Effect, Layer } from 'effect'

export interface SendEmailInput {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
}

export class EmailSendFailed extends Data.TaggedError('EmailSendFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'EMAIL_SEND_FAILED'
  get message() { return 'Email send operation failed' }
}

/**
 * Transport-only Tag. Templating (subject/html/text composition) lives in
 * subscribers, not here. Real impls (SMTP, SES) are drop-in replacements
 * for `loggingLayer` via `AuthModuleConfig.email.layer`.
 */
export class EmailService extends Context.Service<
  EmailService,
  {
    readonly send: (input: SendEmailInput) => Effect.Effect<void, EmailSendFailed>
  }
>()('@czo/kit/EmailService') {}

/**
 * Dev/test impl: logs structurally via Effect.logInfo. A developer can grep
 * the structured logs for the reset/verify token to exercise the flow
 * without a real mail server.
 */
export const loggingLayer: Layer.Layer<EmailService> = Layer.succeed(EmailService, {
  send: input => Effect.logInfo('email.send', {
    to: input.to,
    from: input.from ?? null,
    subject: input.subject,
    bodyPreview: input.text ?? input.html.slice(0, 200),
  }),
})
