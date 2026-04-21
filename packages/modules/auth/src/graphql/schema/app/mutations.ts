import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { useContainer } from '@czo/kit/ioc'
import { AppHandleTakenError, AppManifestInvalidError, AppNotInstalledError } from './errors'
import { setAppStatusSchema, updateAppManifestSchema } from './inputs'

// ─── App Mutations ────────────────────────────────────────────────────────────

export function registerAppMutations(builder: any): void {
  // ── installApp — install from manifest URL ────────────────────────────────
  builder.mutationField('installApp', (t: any) =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, AppHandleTakenError, AppManifestInvalidError] },
      args: {
        input: t.arg({ type: 'InstallAppInput', required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['install'] } },
      resolve: async (_root: any, args: any, ctx: any) => {
        const authUser = (ctx as any).auth?.user
        if (!authUser) throw new UnauthenticatedError()

        const container = useContainer()
        const appService = await container.make('auth:apps')
        const apiKeyService = await container.make('auth:apikeys')

        try {
          const result = await (appService as any).installFromUrl(
            args.input.manifestUrl,
            authUser.id,
            apiKeyService,
            args.input.organizationId ? String(args.input.organizationId) : undefined,
          )
          if (!result) throw new NotFoundError('App', 'installed')
          return result
        }
        catch (err: any) {
          if (err?.message?.includes('already installed')) {
            throw new AppHandleTakenError(err.message)
          }
          if (err?.message?.includes('manifest')) {
            throw new AppManifestInvalidError(err.message)
          }
          throw err
        }
      },
    }),
  )

  // ── uninstallApp ──────────────────────────────────────────────────────────
  builder.mutationField('uninstallApp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, AppNotInstalledError] },
      args: {
        appId: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['uninstall'] } },
      resolve: async (_root: any, args: any) => {
        const container = useContainer()
        const appService = await container.make('auth:apps')
        try {
          await (appService as any).uninstall(args.appId)
          return true
        }
        catch (err: any) {
          if (err?.message?.includes('not found')) {
            throw new AppNotInstalledError(args.appId)
          }
          throw err
        }
      },
    }),
  )

  // ── updateAppManifest — update manifest for an installed app ──────────────
  builder.mutationField('updateAppManifest', (t: any) =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, NotFoundError, AppManifestInvalidError] },
      args: {
        input: t.arg({ type: 'UpdateAppManifestInput', required: true }),
        manifest: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['update'] } },
      resolve: async (_root: any, args: any) => {
        let parsedManifest: unknown
        try {
          parsedManifest = JSON.parse(args.manifest)
        }
        catch {
          throw new AppManifestInvalidError('Manifest must be valid JSON')
        }

        const container = useContainer()
        const appService = await container.make('auth:apps')
        try {
          const result = await (appService as any).updateManifest(args.input.appId, parsedManifest)
          if (!result) throw new NotFoundError('App', args.input.appId)
          return result
        }
        catch (err: any) {
          if (err instanceof NotFoundError || err instanceof AppManifestInvalidError) throw err
          if (err?.message?.includes('not found')) {
            throw new NotFoundError('App', args.input.appId)
          }
          if (err?.message?.includes('manifest') || err?.name === 'ZodError') {
            throw new AppManifestInvalidError(err.message)
          }
          throw err
        }
      },
    }),
  )

  // ── setAppStatus — activate, disable, or mark app as error ───────────────
  builder.mutationField('setAppStatus', (t: any) =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, NotFoundError] },
      args: {
        input: t.arg({ type: 'SetAppStatusInput', required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['update'] } },
      resolve: async (_root: any, args: any) => {
        const parsed = setAppStatusSchema.safeParse(args.input)
        if (!parsed.success) throw ValidationError.fromZod(parsed.error as any)

        const container = useContainer()
        const appService = await container.make('auth:apps')
        try {
          const result = await (appService as any).setStatus(
            parsed.data.appId,
            parsed.data.status as any,
          )
          if (!result) throw new NotFoundError('App', parsed.data.appId)
          return result
        }
        catch (err: any) {
          if (err instanceof NotFoundError) throw err
          if (err?.message?.includes('not found')) {
            throw new NotFoundError('App', parsed.data.appId)
          }
          throw err
        }
      },
    }),
  )
}
