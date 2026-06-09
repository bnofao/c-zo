import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { OptimisticLockError } from '@czo/kit/db'
import { ValidationError } from '@czo/kit/graphql'
import { Effect } from 'effect'
import z from 'zod'
import { LocaleService } from '../../../services/locale'
import { LocaleCodeTaken, LocaleNotFound } from './errors'

export function registerLocaleMutations(builder: TranslationGraphQLSchemaBuilder): void {
  builder.relayMutationField(
    'createLocale',
    {
      inputFields: t => ({
        code: t.string({ required: true, validate: z.string().min(2).max(16).transform(v => v.trim().toLowerCase()), description: 'BCP-47 locale code; trimmed and lowercased. Must be unique in the registry.' }),
        name: t.string({ required: true, validate: z.string().min(1).max(128), description: 'Human-readable display name of the locale.' }),
        isActive: t.boolean({ description: 'Whether the locale is active on creation; defaults to the service default.' }),
      }),
    },
    {
      description: 'Add a locale to the platform registry. Requires the global `locale:create` permission. Fails with LocaleCodeTaken if the code already exists.',
      errors: { types: [ValidationError, LocaleCodeTaken] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['create'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.createLocale({ code: args.input.code, name: args.input.name, isActive: args.input.isActive ?? undefined })
        }))
        return { locale }
      },
    },
    {
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The newly created locale.' }),
      }),
    },
  )

  builder.relayMutationField(
    'updateLocale',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true, description: 'The Locale to update.' }),
        version: t.int({ required: true, description: 'Optimistic-lock version; must match the current row or the update is rejected.' }),
        name: t.string({ validate: z.string().min(1).max(128).optional(), description: 'New display name; omit to leave unchanged.' }),
        isActive: t.boolean({ description: 'New active state; omit to leave unchanged.' }),
      }),
    },
    {
      description: 'Update a locale\'s name or active state. Requires the global `locale:update` permission.',
      errors: { types: [ValidationError, LocaleNotFound, OptimisticLockError] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['update'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.updateLocale(Number(args.input.id.id), args.input.version, { name: args.input.name ?? undefined, isActive: args.input.isActive ?? undefined })
        }))
        return { locale }
      },
    },
    {
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The updated locale.' }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteLocale',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true, description: 'The Locale to soft-delete.' }),
        version: t.int({ required: true, description: 'Optimistic-lock version; must match the current row or the delete is rejected.' }),
      }),
    },
    {
      description: 'Soft-delete a locale from the registry. Requires the global `locale:delete` permission.',
      errors: { types: [LocaleNotFound, OptimisticLockError] },
      authScopes: () => ({ permission: { resource: 'locale', actions: ['delete'] } }),
      resolve: async (_root, args, ctx) => {
        const locale = await ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.softDeleteLocale(Number(args.input.id.id), args.input.version)
        }))
        return { locale }
      },
    },
    {
      outputFields: t => ({
        locale: t.field({ type: 'Locale', resolve: p => p.locale, description: 'The soft-deleted locale.' }),
      }),
    },
  )
}
