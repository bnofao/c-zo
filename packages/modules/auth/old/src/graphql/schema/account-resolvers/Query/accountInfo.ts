import type { QueryResolvers } from './../../../../__generated__/types.generated'

export const accountInfo: NonNullable<QueryResolvers['accountInfo']> = async (_parent, _arg, _ctx) => {
  const info = await _ctx.auth.authService.accountInfo(_ctx.request.headers)
  if (!info)
    throw new Error('Account info not available')
  return info
}
