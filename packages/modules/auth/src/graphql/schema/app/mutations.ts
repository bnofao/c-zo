import type { AuthContext } from '@czo/auth/types'
import type { SchemaBuilder } from '@czo/kit/graphql'
import { AUTH_EVENTS, publishAuthEvent } from '@czo/auth/events'
import { NotFoundError, UnauthenticatedError, ValidationError } from '@czo/kit/graphql'
import { AppHandleTakenError, AppManifestInvalidError, AppNotInstalledError } from './errors'

interface Ctx { auth: AuthContext, request?: Request }

// ─── App Mutations ────────────────────────────────────────────────────────────

export function registerAppMutations(builder: SchemaBuilder): void {
  // ── installApp — install from manifest URL ────────────────────────────────
  builder.mutationField('installApp', t =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, AppHandleTakenError, AppManifestInvalidError] },
      args: {
        input: t.arg({ type: 'InstallAppInput', required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['install'] } },
      resolve: async (_root: unknown, args: { input: { manifestUrl: string, organizationId?: string | null } }, ctx: Ctx) => {
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
        catch (err: unknown) {
          const e = err as { message?: string }
          if (e?.message?.includes('already installed')) {
            throw new AppHandleTakenError(e.message ?? '')
          }
          if (e?.message?.includes('manifest')) {
            throw new AppManifestInvalidError(e.message ?? '')
          }
          throw err
        }
      },
    }))

  // ── uninstallApp ──────────────────────────────────────────────────────────
  builder.mutationField('uninstallApp', t =>
    t.field({
      type: 'Boolean',
      errors: { types: [NotFoundError, AppNotInstalledError] },
      args: {
        appId: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['uninstall'] } },
      resolve: async (_root: unknown, args: { appId: string }, ctx: Ctx) => {
        try {
          await ctx.auth.appService.uninstall(args.appId)

          await publishAuthEvent(AUTH_EVENTS.APP_UNINSTALLED, { appId: args.appId })

          return true
        }
        catch (err: unknown) {
          const e = err as { message?: string }
          if (e?.message?.includes('not found')) {
            throw new AppNotInstalledError(args.appId)
          }
          throw err
        }
      },
    }))

  // ── updateAppManifest — update manifest for an installed app ──────────────
  builder.mutationField('updateAppManifest', t =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, NotFoundError, AppManifestInvalidError] },
      args: {
        input: t.arg({ type: 'UpdateAppManifestInput', required: true }),
        manifest: t.arg.string({ required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['update'] } },
      resolve: async (_root: unknown, args: { input: { appId: string }, manifest: string }, ctx: Ctx) => {
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
        catch (err: unknown) {
          if (err instanceof NotFoundError || err instanceof AppManifestInvalidError)
            throw err
          const e = err as { message?: string, name?: string }
          if (e?.message?.includes('not found')) {
            throw new NotFoundError('App', args.input.appId)
          }
          if (e?.message?.includes('manifest') || e?.name === 'ZodError') {
            throw new AppManifestInvalidError(e.message ?? '')
          }
          throw err
        }
      },
    }))

  // ── setAppStatus — activate, disable, or mark app as error ───────────────
  builder.mutationField('setAppStatus', t =>
    t.field({
      type: 'App',
      errors: { types: [ValidationError, NotFoundError] },
      args: {
        input: t.arg({ type: 'SetAppStatusInput', required: true }),
      },
      authScopes: { permission: { resource: 'apps', actions: ['update'] } },
      resolve: async (_root: unknown, args: { input: { appId: string, status: 'active' | 'inactive' | 'suspended' } }, ctx: Ctx) => {
        try {
          const result = await ctx.auth.appService.setStatus(
            args.input.appId,
            args.input.status as any,
          )
          if (!result)
            throw new NotFoundError('App', args.input.appId)

          await publishAuthEvent(AUTH_EVENTS.APP_UPDATED, {
            appId: result.appId,
            version: (result.manifest as any)?.version ?? '',
            status: args.input.status,
          })

          return result
        }
        catch (err: unknown) {
          if (err instanceof NotFoundError)
            throw err
          const e = err as { message?: string }
          if (e?.message?.includes('not found')) {
            throw new NotFoundError('App', args.input.appId)
          }
          throw err
        }
      },
    }))
}
