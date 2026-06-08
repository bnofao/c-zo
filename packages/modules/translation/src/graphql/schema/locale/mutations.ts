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
        code: t.string({ required: true, validate: z.string().min(2).max(16).transform(v => v.trim().toLowerCase()) }),
        name: t.string({ required: true, validate: z.string().min(1).max(128) }),
        isActive: t.boolean(),
      }),
    },
    {
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
        locale: t.field({ type: 'Locale', resolve: p => p.locale }),
      }),
    },
  )

  builder.relayMutationField(
    'updateLocale',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true }),
        version: t.int({ required: true }),
        name: t.string({ validate: z.string().min(1).max(128).optional() }),
        isActive: t.boolean(),
      }),
    },
    {
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
        locale: t.field({ type: 'Locale', resolve: p => p.locale }),
      }),
    },
  )

  builder.relayMutationField(
    'deleteLocale',
    {
      inputFields: t => ({
        id: t.globalID({ for: 'Locale', required: true }),
        version: t.int({ required: true }),
      }),
    },
    {
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
        locale: t.field({ type: 'Locale', resolve: p => p.locale }),
      }),
    },
  )
}
