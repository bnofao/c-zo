import type { TranslationGraphQLSchemaBuilder } from '@czo/translation/graphql'
import { Effect } from 'effect'
import { LocaleService } from '../../../services/locale'

export function registerLocaleQueries(builder: TranslationGraphQLSchemaBuilder): void {
  builder.queryField('locales', t =>
    t.drizzleConnection({
      type: 'locales',
      description: 'Paginated (relay) connection over the platform locale registry. Public read.',
      args: { activeOnly: t.arg.boolean({ description: 'When true, return only active locales; defaults to false (all).' }) },
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
      description: 'Fetch a single locale by id. Public read; returns null if not found.',
      args: { id: t.arg.globalID({ for: 'Locale', required: true, description: 'Relay global id of the Locale to fetch.' }) },
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
      description: 'The platform default locale, used as the fallback when a translation is missing. Null if none is configured. Public read.',
      resolve: async (_query, _root, _args, ctx) =>
        ctx.runEffect(Effect.gen(function* () {
          const svc = yield* LocaleService
          return yield* svc.getDefaultLocale()
        })) as Promise<any>,
    }))
}
