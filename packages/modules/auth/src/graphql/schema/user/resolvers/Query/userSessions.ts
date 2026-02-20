
        import type   { QueryResolvers } from './../../../../__generated__/types.generated';
        export const userSessions: NonNullable<QueryResolvers['userSessions']> = async (_parent, _arg, _ctx) => _ctx.auth.userService.listSessions(_ctx.request.headers, _arg.userId)