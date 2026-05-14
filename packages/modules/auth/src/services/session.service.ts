// ─────────────────────────────────────────────────────────────────────
// TODO(effect-migration): session service — NOT YET MIGRATED.
//
// Parked while the Effect-TS migration rolls out module-by-module (done:
// apiKey, user, organization, auth). Legacy `createSessionService` body
// below is commented out and the `auth:sessions` container binding is
// disabled in `types.ts`. Note: basic session reads/revokes already exist
// on the migrated `UserService` (listSessions / revokeSession /
// revokeSessions) — when migrating, decide whether this service is still
// needed or whether its remaining surface folds into UserService.
// ─────────────────────────────────────────────────────────────────────

// import type { Auth } from '@czo/auth/config'
// import type { Database } from '@czo/kit/db'
// import { eq } from 'drizzle-orm'
// import { sessions } from '../database/schema'
// import { mapAPIError } from './_internal/map-error'

// // ─── Types ───────────────────────────────────────────────────────────

// export type SessionService = ReturnType<typeof createSessionService>

// // ─── Factory ─────────────────────────────────────────────────────────

// export function createSessionService(db: Database, auth: Auth) {
//   return {
//     // ── Reads — Drizzle direct ──

//     async find(id: string) {
//       const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1)
//       return row ?? null
//     },

//     async listByUser(userId: string) {
//       return db.select().from(sessions).where(eq(sessions.userId, userId))
//     },

//     async listActive(userId: string) {
//       const now = new Date()
//       const rows = await db.select().from(sessions).where(eq(sessions.userId, userId))
//       return rows.filter(s => s.expiresAt > now)
//     },

//     // ── Writes via better-auth ──

//     async revoke(token: string, headers: Headers) {
//       try {
//         return await auth.api.revokeSession({ headers, body: { token } })
//       }
//       catch (err) { mapAPIError(err, 'Session') }
//     },

//     async revokeAll(userId: string, headers: Headers) {
//       try {
//         return await (auth.api as any).revokeUserSessions({ headers, body: { userId } })
//       }
//       catch (err) { mapAPIError(err, 'Session') }
//     },

//     async revokeOtherSessions(headers: Headers) {
//       try {
//         return await auth.api.revokeOtherSessions({ headers })
//       }
//       catch (err) { mapAPIError(err, 'Session') }
//     },

//     async listSessions(headers: Headers) {
//       try {
//         return await auth.api.listSessions({ headers })
//       }
//       catch (err) { mapAPIError(err, 'Session') }
//     },
//   }
// }
