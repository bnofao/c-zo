export type { Relations as AuthRelations } from '@czo/auth/relations'

export interface AuthContext {
  /** session — narrowed when needed */
  session: any
  /** user — narrowed when needed */
  user?: any
}
