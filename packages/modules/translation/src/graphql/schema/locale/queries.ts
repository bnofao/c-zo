import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { Effect } from 'effect'
import { LocaleService } from '../../../services/locale'

export function registerLocaleQueries(builder: TranslationGraphQLSchemaBuilder): void {
  builder.queryField('locales', t =>
    t.drizzleConnection({
      type: 'locales',
      args: { activeOnly: t.arg.boolean() },
      resolve: async (query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.listLocales({ activeOnly: args.activeOnly ?? false, query: query({}) })
        })) as Promise<any>,
    }))

  builder.queryField('locale', t =>
    t.drizzleField({
      type: 'locales',
      nullable: true,
      args: { id: t.arg.globalID({ for: 'Locale', required: true }) },
      resolve: async (_query, _root, args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.findLocaleById(Number(args.id.id))
        }).pipe(Effect.catchTag('LocaleNotFound', () => Effect.succeed(null)))),
    }))

  builder.queryField('defaultLocale', t =>
    t.drizzleField({
      type: 'locales',
      nullable: true,
      resolve: async (_query, _root, _args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.getDefaultLocale()
        })) as Promise<any>,
    }))
}
