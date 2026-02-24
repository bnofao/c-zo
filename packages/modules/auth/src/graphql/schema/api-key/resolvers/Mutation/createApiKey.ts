import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const createApiKey: NonNullable<MutationResolvers['createApiKey']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.apiKeyService.create({
    name: _arg.input.name,
    expiresIn: _arg.input.expiresIn ?? undefined,
    prefix: _arg.input.prefix ?? undefined,
    remaining: _arg.input.remaining ?? undefined,
    metadata: _arg.input.metadata ?? undefined,
    refillAmount: _arg.input.refillAmount ?? undefined,
    refillInterval: _arg.input.refillInterval ?? undefined,
    rateLimitEnabled: _arg.input.rateLimitEnabled ?? undefined,
    rateLimitTimeWindow: _arg.input.rateLimitTimeWindow ?? undefined,
    rateLimitMax: _arg.input.rateLimitMax ?? undefined,
  }, _ctx.request.headers)
