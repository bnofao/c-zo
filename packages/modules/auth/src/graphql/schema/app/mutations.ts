import type { AuthContext } from '@czo/auth/types'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { AppHandleTakenError, AppManifestInvalidError, AppNotInstalledError } from './errors'
import { setAppStatusSchema } from './inputs'

interface Ctx { auth: AuthContext, request?: Request }

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const authUser = ctx.auth?.user
        if (!authUser)
          throw new UnauthenticatedError()

        try {
          const result = await ctx.auth.appService.installFromUrl(
            args.input.manifestUrl,
            authUser.id,
            ctx.auth.apiKeyService,
            args.input.organizationId ? String(args.input.organizationId) : undefined,
          )
          if (!result)
            throw new NotFoundError('App', 'installed')

          await publishAuthEvent(AUTH_EVENTS.APP_INSTALLED, {
            appId: (result as any).appId,
            registerUrl: (result as any).manifest?.register ?? '',
            apiKey: '',
            installedBy: authUser.id,
            organizationId: args.input.organizationId ? String(args.input.organizationId) : undefined,
            webhookSecret: (result as any).webhookSecret ?? '',
          })

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
    }))

  // ── uninstallApp ──────────────────────────────────────────────────────────
  builder.mutationField('uninstallApp', (t: any) =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, AppNotInstalledError] },
      args: {
        appId: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['uninstall'] } },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        try {
          await ctx.auth.appService.uninstall(args.appId)

          await publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId: args.appId })

          return true
        }
        catch (err: any) {
          if (err?.message?.includes('not found')) {
            throw new AppNotInstalledError(args.appId)
          }
          throw err
        }
      },
    }))

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
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        let parsedManifest: unknown
        try {
          parsedManifest = JSON.parse(args.manifest)
        }
        catch {
          throw new AppManifestInvalidError('Manifest must be valid JSON')
        }

        try {
          const result = await ctx.auth.appService.updateManifest(args.input.appId, parsedManifest)
          if (!result)
            throw new NotFoundError('App', args.input.appId)

          await publishAuthEvent(AUTH_EVENTS.APP_UPDATED, {
            appId: result.appId,
            version: (result.manifest as any)?.version ?? '',
            status: result.status,
          })

          return result
        }
        catch (err: any) {
          if (err instanceof NotFoundError || err instanceof AppManifestInvalidError)
            throw err
          if (err?.message?.includes('not found')) {
            throw new NotFoundError('App', args.input.appId)
          }
          if (err?.message?.includes('manifest') || err?.name === 'ZodError') {
            throw new AppManifestInvalidError(err.message)
          }
          throw err
        }
      },
    }))

  // ── setAppStatus — activate, disable, or mark app as error ───────────────
  builder.mutationField('setAppStatus', (t: any) =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, NotFoundError] },
      args: {
        input: t.arg({ type: 'SetAppStatusInput', required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['update'] } },
      resolve: async (_root: unknown, args: any, ctx: Ctx) => {
        const parsed = setAppStatusSchema.safeParse(args.input)
        if (!parsed.success)
          throw ValidationError.fromZod(parsed.error as any)

        try {
          const result = await ctx.auth.appService.setStatus(
            parsed.data.appId,
            parsed.data.status as any,
          )
          if (!result)
            throw new NotFoundError('App', parsed.data.appId)

          await publishAuthEvent(AUTH_EVENTS.APP_UPDATED, {
            appId: result.appId,
            version: (result.manifest as any)?.version ?? '',
            status: parsed.data.status,
          })

          return result
        }
        catch (err: any) {
          if (err instanceof NotFoundError)
            throw err
          if (err?.message?.includes('not found')) {
            throw new NotFoundError('App', parsed.data.appId)
          }
          throw err
        }
      },
    }))
}
