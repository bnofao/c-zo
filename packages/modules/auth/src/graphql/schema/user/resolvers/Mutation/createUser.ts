import type { MutationResolvers } from './../../../../__generated__/types.generated'
import { withPaylaod } from '@czo/kit/graphql'

export const createUser: NonNullable<MutationResolvers['createUser']> = async (_parent, _arg, _ctx) => {
  const { password, role, ...input } = _arg.input

  return await withPaylaod({
    key: 'user',
    row: async () => {
      const [user] = await _ctx.auth.userService.create({
        ...input,
        role: role ? role.join(',') : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: false,
      })

      if (!user) {
        throw new Error('Failed to create user')
      }

      if (password) {
        const authContext = await _ctx.auth.instance.$context
        const hashedPassword = await authContext.password.hash(password)

        await _ctx.auth.authService.account.create({
          accountId: `${user.id}`,
          userId: user.id as number,
          providerId: 'credential',
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      return user
    },
  })
}
