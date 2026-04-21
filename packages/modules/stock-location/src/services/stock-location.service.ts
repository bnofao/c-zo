import { and, eq, sql } from 'drizzle-orm'
import { notDeleted, optimisticUpdate, toDatabaseError, type Database } from '@czo/kit/db'
import { OptimisticLockError } from '@czo/kit/db'
import { stockLocationAddresses, stockLocations } from '../database/schema'
import { publishStockLocationEvent } from '../events/stock-location-events'
import { STOCK_LOCATION_EVENTS } from '../events/types'

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateStockLocationAddressInput {
  addressLine1: string
  addressLine2?: string
  city: string
  province?: string
  postalCode?: string
  countryCode: string
  phone?: string
}

export interface CreateStockLocationInput {
  organizationId: string
  name: string
  handle: string
  isDefault?: boolean
  isActive?: boolean
  metadata?: Record<string, unknown>
  address?: CreateStockLocationAddressInput
}

export interface UpdateStockLocationInput {
  name?: string
  handle?: string
  metadata?: Record<string, unknown>
  address?: CreateStockLocationAddressInput
}

// ─── Handle generation ───────────────────────────────────────────────────────

export function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// ─── Service factory ─────────────────────────────────────────────────────────

export function createStockLocationService(db: Database) {
  return {
    async find(id: number) {
      const [row] = await db
        .select()
        .from(stockLocations)
        .where(notDeleted(stockLocations, eq(stockLocations.id, id)))
        .limit(1)
      return row ?? null
    },

    async findByHandle(organizationId: string, handle: string) {
      const [row] = await db
        .select()
        .from(stockLocations)
        .where(notDeleted(stockLocations, and(
          eq(stockLocations.organizationId, organizationId),
          eq(stockLocations.handle, handle),
        )!))
        .limit(1)
      return row ?? null
    },

    async create(input: CreateStockLocationInput) {
      return db.transaction(async (tx) => {
        try {
          const rows = await tx
            .insert(stockLocations)
            .values({
              organizationId: input.organizationId,
              name: input.name,
              handle: input.handle,
              isDefault: input.isDefault ?? false,
              isActive: input.isActive ?? true,
              metadata: input.metadata ?? null,
            })
            .returning()
          const location = rows[0]!

          if (input.address) {
            await tx.insert(stockLocationAddresses).values({
              stockLocationId: location.id,
              ...input.address,
            })
          }

          await publishStockLocationEvent(STOCK_LOCATION_EVENTS.CREATED, {
            id: String(location.id),
            organizationId: location.organizationId,
            handle: location.handle,
            name: location.name,
          })

          return location
        }
        catch (err) {
          throw toDatabaseError(err)
        }
      })
    },

    async update(id: number, expectedVersion: number, input: UpdateStockLocationInput) {
      const updated = await optimisticUpdate({
        db,
        table: stockLocations,
        id,
        expectedVersion,
        values: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.handle !== undefined && { handle: input.handle }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        },
      })

      if (input.address) {
        await db
          .insert(stockLocationAddresses)
          .values({ stockLocationId: id, ...input.address })
          .onConflictDoUpdate({
            target: stockLocationAddresses.stockLocationId,
            set: input.address,
          })
      }

      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.UPDATED, {
        id: String(id),
        organizationId: updated.organizationId,
        changes: Object.keys(input).filter(k => k !== 'address'),
      })

      return updated
    },

    async softDelete(id: number, expectedVersion: number) {
      const deleted = await optimisticUpdate({
        db,
        table: stockLocations,
        id,
        expectedVersion,
        values: { deletedAt: sql`NOW()` as any },
      })

      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.DELETED, {
        id: String(id),
        organizationId: deleted.organizationId,
        handle: deleted.handle,
      })

      return deleted
    },

    async setStatus(id: number, expectedVersion: number, isActive: boolean) {
      const updated = await optimisticUpdate({
        db,
        table: stockLocations,
        id,
        expectedVersion,
        values: { isActive },
      })

      await publishStockLocationEvent(STOCK_LOCATION_EVENTS.STATUS_CHANGED, {
        id: String(id),
        organizationId: updated.organizationId,
        isActive,
      })

      return updated
    },

    async setDefault(id: number, expectedVersion: number) {
      return db.transaction(async (tx) => {
        // Lock target row + resolve its org
        const [target] = await tx
          .select({ organizationId: stockLocations.organizationId })
          .from(stockLocations)
          .where(and(eq(stockLocations.id, id), eq(stockLocations.version, expectedVersion)))
          .for('update')
          .limit(1)

        if (!target) {
          const [current] = await tx
            .select({ version: stockLocations.version })
            .from(stockLocations)
            .where(eq(stockLocations.id, id))
            .limit(1)
          throw new OptimisticLockError(id, expectedVersion, current?.version ?? null)
        }

        // Unset any previous default in the same org
        const [previousDefault] = await tx
          .update(stockLocations)
          .set({ isDefault: false })
          .where(and(
            eq(stockLocations.organizationId, target.organizationId),
            eq(stockLocations.isDefault, true),
          ))
          .returning({ id: stockLocations.id })

        const updated = await optimisticUpdate({
          db: tx as unknown as Database,
          table: stockLocations,
          id,
          expectedVersion,
          values: { isDefault: true },
        })

        await publishStockLocationEvent(STOCK_LOCATION_EVENTS.DEFAULT_CHANGED, {
          id: String(id),
          organizationId: target.organizationId,
          previousDefaultId: previousDefault ? String(previousDefault.id) : null,
        })

        return updated
      })
    },
  }
}

export type StockLocationService = ReturnType<typeof createStockLocationService>
