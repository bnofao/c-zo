import type { MutationResolvers } from './../../../../__generated__/types.generated'

export const updateApiKey: NonNullable<MutationResolvers['updateApiKey']> = async (_parent, _arg, _ctx) =>
  _ctx.auth.apiKeyService.update({
    keyId: _arg.keyId,
    name: _arg.input.name ?? undefined,
    enabled: _arg.input.enabled ?? undefined,
    remaining: _arg.input.remaining ?? undefined,
    metadata: _arg.input.metadata ?? undefined,
    expiresIn: _arg.input.expiresIn ?? undefined,
    refillAmount: _arg.input.refillAmount ?? undefined,
    refillInterval: _arg.input.refillInterval ?? undefined,
    rateLimitEnabled: _arg.input.rateLimitEnabled ?? undefined,
    rateLimitTimeWindow: _arg.input.rateLimitTimeWindow ?? undefined,
    rateLimitMax: _arg.input.rateLimitMax ?? undefined,
  }, _ctx.request.headers)
