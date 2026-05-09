import type { AuthGraphQLShemaBuilder, CreateUserInput, UpdateUserInput, UserWhereInput } from '@czo/auth/types'
import { orderDirectionSchema, type SchemaBuilderRefs } from '@czo/kit/graphql'
import { createUserSchema, updateUserSchema, userOrderFieldSchema } from '@czo/auth/types'
import { z } from 'zod'

export const userWhereSchema = z.object({
  emailVerified: z.boolean().optional(),
  banned: z.boolean().optional(),
})

export const userOrderBySchema = z.object({
  field: z.enum(['name', 'email', 'createdAt']),
  direction: z.enum(['asc', 'desc']),
})

// ─── Pothos input type registration ──────────────────────────────────────────

export function registerUserInputs(builder: AuthGraphQLShemaBuilder): void {
  builder.inputType('UserCreateData', {
    validate: createUserSchema,
    fields: t => ({
      email: t.string({ required: true }),
      name: t.string({ required: true }),
      password: t.string({ required: true }),
      role: t.string(),
    }),
  })

  builder.inputType('UserUpdateData', {
    validate: updateUserSchema,
    fields: (t) => ({
      name: t.string(),
      role: t.string(),
    }),
  })

  const UserWhereInputRef = builder.inputRef<UserWhereInput>('UserWhereInput').implement({
    fields: (t) => ({
      name: t.field({ type: 'StringFilterInput' }),
      email: t.field({ type: 'StringFilterInput' }),
      emailVerified: t.field({ type: 'BooleanFilterInput' }),
      twoFactorEnabled: t.field({ type: 'BooleanFilterInput' }),
      banned: t.field({ type: 'BooleanFilterInput' }),
      banReason: t.field({ type: 'StringFilterInput' }),
      banExpires: t.field({ type: 'DateTimeFilterInput' }),
      createdAt: t.field({ type: 'DateTimeFilterInput' }),
      AND: t.field({ type: [UserWhereInputRef] }),
      OR: t.field({ type: [UserWhereInputRef] }),
      NOT: t.field({ type: UserWhereInputRef }),
    }),
  })

  const UserOrderFieldRef = builder.enumType('UserOrderField', {
    values: {
      NAME: { value: 'name' },
      EMAIL: { value: 'email' },
      CREATED_AT: { value: 'createdAt' },
    } as const,
  })

  const OrderDirectionRef = builder.enumType('OrderDirection', {
    values: {
      ASC: { value: 'asc' },
      DESC: { value: 'desc' },
    } as const,
  })

  builder.inputType('UserOrderByInput', {
    fields: (t) => ({
      field: t.field({ type: UserOrderFieldRef, required: true, validate: userOrderFieldSchema }),
      direction: t.field({ type: OrderDirectionRef, required: true, validate: orderDirectionSchema }),
    }),
  })

  builder.inputType('UserBanData', {
    fields: (t) => ({
      reason: t.string(),
      expires: t.field({ type: 'DateTime' }),
    }),
  })

  builder.inputType('ImpersonateUserInput', {
    fields: (t) => ({
      byUserId: t.int({ required: true }),
      actor: t.string({ required: true }),
      sessionDuration: t.int({ description: 'Duration in seconds' }),
    }),
  })
}
