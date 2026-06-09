import type { AuthGraphQLSchemaBuilder, UserWhereInput } from '@czo/auth/graphql'
import { orderDirectionSchema } from '@czo/kit/graphql'
import { z } from 'zod'

export const userWhereSchema = z.object({
  emailVerified: z.boolean().optional(),
  banned: z.boolean().optional(),
})

export const userOrderFieldSchema = z.enum({
  NAME: 'name',
  EMAIL: 'email',
  CREATED_AT: 'createdAt',
})

export const userOrderBySchema = z.object({
  field: z.enum(['name', 'email', 'createdAt']),
  direction: z.enum(['asc', 'desc']),
})

// const createUserSchema = z.object({
//   email: z.email().transform(email => email.toLowerCase()),
//   name: z.string().max(225).min(1).transform(name => name.trim()),
//   role: z.union([z.string(), z.array(z.string())]).nullable().optional(),
//   password: z.string().min(8).max(128).nullable().optional(),
// })

// const updateUserSchema = z.object({
//   name: z.string().max(225).min(1).transform(name => name?.trim()),
//   role: z.union([z.string(), z.array(z.string())]).nullable().optional(),
// })

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerUserInputs(builder: AuthGraphQLSchemaBuilder): void {
  // builder.inputType('UserCreateData', {
  //   validate: createUserSchema,
  //   fields: t => ({
  //     email: t.string({ required: true }),
  //     name: t.string({ required: true }),
  //     password: t.string({ required: true }),
  //     role: t.string(),
  //   }),
  // })

  // builder.inputType('UserUpdateData', {
  //   validate: updateUserSchema,
  //   fields: t => ({
  //     name: t.string(),
  //     role: t.string(),
  //   }),
  // })

  const UserWhereInputRef = builder.inputRef<UserWhereInput>('UserWhereInput').implement({
    description: 'Filter conditions for selecting users, combinable via the AND, OR, and NOT operators.',
    fields: t => ({
      name: t.field({ description: 'Filter users by display name.', type: 'StringFilterInput' }),
      email: t.field({ description: 'Filter users by email address.', type: 'StringFilterInput' }),
      emailVerified: t.field({ description: 'Filter users by whether their email is verified.', type: 'BooleanFilterInput' }),
      twoFactorEnabled: t.field({ description: 'Filter users by whether two-factor authentication is enabled.', type: 'BooleanFilterInput' }),
      banned: t.field({ description: 'Filter users by whether they are currently banned.', type: 'BooleanFilterInput' }),
      banReason: t.field({ description: 'Filter users by the recorded ban reason.', type: 'StringFilterInput' }),
      banExpires: t.field({ description: 'Filter users by ban expiry timestamp.', type: 'DateTimeFilterInput' }),
      createdAt: t.field({ description: 'Filter users by account creation timestamp.', type: 'DateTimeFilterInput' }),
      AND: t.field({ description: 'Match users satisfying all of the given sub-filters.', type: [UserWhereInputRef] }),
      OR: t.field({ description: 'Match users satisfying any of the given sub-filters.', type: [UserWhereInputRef] }),
      NOT: t.field({ description: 'Match users that do not satisfy the given sub-filter.', type: UserWhereInputRef }),
    }),
  })

  const UserOrderFieldRef = builder.enumType('UserOrderField', {
    description: 'Fields by which a list of users can be ordered.',
    values: {
      NAME: { description: 'Order by display name.', value: 'name' },
      EMAIL: { description: 'Order by email address.', value: 'email' },
      CREATED_AT: { description: 'Order by account creation timestamp.', value: 'createdAt' },
    } as const,
  })

  const OrderDirectionRef = builder.enumType('OrderDirection', {
    description: 'Direction in which results are sorted.',
    values: {
      ASC: { description: 'Sort in ascending order.', value: 'asc' },
      DESC: { description: 'Sort in descending order.', value: 'desc' },
    } as const,
  })

  builder.inputType('UserOrderByInput', {
    description: 'Specifies a field and direction by which to order a list of users.',
    fields: t => ({
      field: t.field({ description: 'Field to order users by.', type: UserOrderFieldRef, required: true, validate: userOrderFieldSchema }),
      direction: t.field({ description: 'Direction in which to sort the chosen field.', type: OrderDirectionRef, required: true, validate: orderDirectionSchema }),
    }),
  })

  // builder.inputType('UserBanData', {
  //   fields: t => ({
  //     reason: t.string(),
  //     expiresIn: t.int(),
  //   }),
  // })

  // builder.inputType('ImpersonateUserInput', {
  //   fields: t => ({
  //     byUserId: t.int({ required: true }),
  //     actor: t.string({ required: true }),
  //     sessionDuration: t.int({ description: 'Duration in seconds' }),
  //   }),
  // })
}
