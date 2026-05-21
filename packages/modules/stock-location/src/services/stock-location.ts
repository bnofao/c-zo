import type { NotAMember } from '@czo/auth/services'
import type { Database, OptimisticLockError } from '@czo/kit/db'
import type { InferSelectModel } from 'drizzle-orm'
import type { Effect } from 'effect'
import type { Relations } from '../database/relations'
import type { stockLocations } from '../database/schema'
import { Context, Data } from 'effect'

// ─── Tagged errors (also serve as Pothos GraphQL errors via registerError) ───

export class StockLocationNotFound extends Data.TaggedError('StockLocationNotFound') {
  readonly code = 'STOCK_LOCATION_NOT_FOUND'
  get message() { return 'Stock location not found' }
}

export class HandleTaken extends Data.TaggedError('HandleTaken')<{
  readonly handle: string
}> {
  readonly code = 'STOCK_LOCATION_HANDLE_TAKEN'
  get message() { return `Handle '${this.handle}' already exists in organization` }
}

export class StockLocationNoChanges extends Data.TaggedError('StockLocationNoChanges') {
  readonly code = 'STOCK_LOCATION_NO_CHANGES'
  get message() { return 'No changes provided' }
}

export class StockLocationDbFailed extends Data.TaggedError('StockLocationDbFailed')<{
  readonly cause: unknown
}> {
  readonly code = 'STOCK_LOCATION_DB_FAILED'
  get message() { return 'Database operation failed' }
}

export type StockLocationError
  = | StockLocationNotFound
    | HandleTaken
    | StockLocationNoChanges
    | StockLocationDbFailed
    | OptimisticLockError
    | NotAMember

// ─── Scope ───────────────────────────────────────────────────────────────────

/**
 * Caller identity required for any write. The service enforces that
 * `actorId` is a member of the target stock location's organization (via
 * `@czo/auth/OrganizationService.checkMembership`); non-members fail with
 * the auth domain's `NotAMember` so the GraphQL layer can route it through
 * the shared error type.
 */
export interface ActorScope {
  readonly actorId: number
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateStockLocationAddressInput {
  addressLine1: string
  addressLine2?: string | null
  city: string
  province?: string | null
  postalCode?: string | null
  countryCode: string
  phone?: string | null
}

export interface CreateStockLocationInput {
  organizationId: number
  name: string
  handle: string
  isDefault?: boolean | null
  isActive?: boolean | null
  metadata?: Record<string, unknown> | null
  address?: CreateStockLocationAddressInput
}

export interface UpdateStockLocationInput {
  name?: string
  handle?: string
  metadata?: Record<string, unknown> | null
  address?: Partial<CreateStockLocationAddressInput>
}

// ─── Pure helper (no DB access) ─────────────── | null───────────────────────────────

export function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// ─── Domain model ────────────────────────────────────────────────────────────

export type StockLocation = InferSelectModel<typeof stockLocations>

// ─── Service contract (Effect Tag) ───────────────────────────────────────────

type FindFirstConfig = Parameters<Database<Relations>['query']['stockLocations']['findFirst']>[0]
type FindManyConfig = Parameters<Database<Relations>['query']['stockLocations']['findMany']>[0]

export class StockLocationService extends Context.Service<
  StockLocationService,
  {
    // ── Reads ─────────────────────────────────────────────────────────────
    /**
     * Single-row read via Drizzle RQBv2. Accepts any `findFirst` config —
     * `{ where: { id } }`, `{ where: { organizationId, handle } }`, etc. Fails
     * with `StockLocationNotFound` if no row matches. Soft-deleted rows are
     * implicitly excluded (`deletedAt: { isNull: true }` is merged in).
     */
    readonly findFirst: (
      config?: FindFirstConfig,
    ) => Effect.Effect<StockLocation, StockLocationNotFound | StockLocationDbFailed>

    /**
     * Multi-row read via Drizzle RQBv2. Soft-deleted rows are implicitly
     * excluded. Returns an empty array on no match (never fails with NotFound).
     */
    readonly findMany: (
      config?: FindManyConfig,
    ) => Effect.Effect<readonly StockLocation[], StockLocationDbFailed>

    // ── Writes ────────────────────────────────────────────────────────────
    readonly create: (
      input: CreateStockLocationInput,
      scope: ActorScope,
    ) => Effect.Effect<StockLocation, HandleTaken | NotAMember | StockLocationDbFailed>

    readonly update: (
      id: number,
      expectedVersion: number,
      input: UpdateStockLocationInput,
      scope: ActorScope,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | StockLocationNoChanges | OptimisticLockError | NotAMember | StockLocationDbFailed
    >

    readonly softDelete: (
      id: number,
      expectedVersion: number,
      scope: ActorScope,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | NotAMember | StockLocationDbFailed
    >

    /**
     * Hard-delete the row (and cascade `stockLocationAddresses` via FK
     * `onDelete: 'cascade'`). Use `softDelete` for the auditable path —
     * this is for true purges only.
     */
    readonly delete: (
      id: number,
      expectedVersion: number,
      scope: ActorScope,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | NotAMember | StockLocationDbFailed
    >

    readonly setStatus: (
      id: number,
      expectedVersion: number,
      isActive: boolean,
      scope: ActorScope,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | NotAMember | StockLocationDbFailed
    >

    readonly setDefault: (
      id: number,
      expectedVersion: number,
      scope: ActorScope,
    ) => Effect.Effect<
      StockLocation,
      StockLocationNotFound | OptimisticLockError | NotAMember | StockLocationDbFailed
    >
  }
>()('@czo/stock-location/StockLocationService') {}
