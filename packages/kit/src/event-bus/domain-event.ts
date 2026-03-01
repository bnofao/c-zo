import type { ZodSafeParseResult } from 'zod'
import type { DomainEvent, EventMap, EventMetadata } from './types'
import { getCorrelationId } from '@czo/kit/telemetry'
import { z } from 'zod'

export interface CreateDomainEventOptions<T = unknown> {
  type: string
  payload: T
  id?: string
  metadata?: Partial<EventMetadata>
}

const metadataDefaults: EventMetadata = {
  source: 'unknown',
  version: 1,
}

/**
 * Create a DomainEvent with auto-generated id and timestamp.
 * The returned object is frozen (immutable).
 *
 * When the EventMap is populated via declaration merging, the overload
 * narrows the payload type based on the event type string.
 */
export function createDomainEvent<K extends keyof EventMap>(
  options: CreateDomainEventOptions<EventMap[K]> & { type: K & string },
): DomainEvent<EventMap[K]>
export function createDomainEvent<T = unknown>(
  options: CreateDomainEventOptions<T>,
): DomainEvent<T>
export function createDomainEvent<T = unknown>(
  options: CreateDomainEventOptions<T>,
): DomainEvent<T> {
  const event: DomainEvent<T> = {
    id: options.id ?? crypto.randomUUID(),
    type: options.type,
    timestamp: new Date().toISOString(),
    payload: options.payload,
    metadata: {
      ...metadataDefaults,
      ...options.metadata,
      correlationId: options.metadata?.correlationId ?? getCorrelationId() ?? crypto.randomUUID(),
    },
  }

  return Object.freeze(event)
}

/** Zod schema for validating incoming domain events at system boundaries */
export const domainEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().min(1),
  payload: z.unknown(),
  metadata: z.object({
    source: z.string().min(1),
    correlationId: z.string().optional(),
    causationId: z.string().optional(),
    version: z.number().int().min(1),
    shopId: z.string().optional(),
    actorId: z.string().optional(),
    actorType: z.enum(['user', 'app', 'system']).optional(),
  }),
})

export type ValidatedDomainEvent = z.infer<typeof domainEventSchema>

/**
 * Validate an unknown input against the domain event schema.
 * Use this at system boundaries (incoming RabbitMQ messages, API payloads).
 */
export function validateDomainEvent(input: unknown): ZodSafeParseResult<ValidatedDomainEvent> {
  return domainEventSchema.safeParse(input)
}
