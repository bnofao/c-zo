# TRD: Architecture Microservices -- EventBus Abstraction Layer

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-09
**Last Updated**: 2026-02-09
**Related PRD**: [prd-microservices.md](./prd-microservices.md)
**Related Brainstorm**: [brainstorm-microservices.md](./brainstorm-microservices.md)
**Related TRD (parent)**: [trd.md](./trd.md)

---

## 1. Overview

Ce TRD decrit l'implementation de la **couche d'abstraction EventBus** avec un **provider pattern** qui fait le pont entre l'`EventEmitter` hookable actuel (monolithe) et un futur EventBus base sur RabbitMQ (microservices).

Il s'agit de la **Phase 0** de la strategie de migration microservices : preparer le monolithe sans rien casser. L'objectif est de permettre aux modules de publier et consommer des events de domaine via une API unifiee, independante du backend de transport sous-jacent.

**Composants couverts par ce TRD :**

| Composant | Description | Priorite |
|-----------|-------------|----------|
| `EventBus` interface | Contrat d'abstraction publish/subscribe | P0 (Phase 0a) |
| `DomainEvent` envelope | Schema standard pour les events de domaine | P0 (Phase 0a) |
| `HookableEventBus` provider | Adapter sur l'`EventEmitter` hookable existant | P0 (Phase 0a) |
| `RabbitMQEventBus` provider | Client AMQP avec gestion exchanges/queues | P0 (Phase 0b) |
| `useEventBus()` helper | Helper runtime singleton (pattern `useQueue()`) | P0 (Phase 0a) |
| `CzoConfig` extension | Ajout de la section `eventBus` a la configuration | P0 (Phase 0a) |
| Mode dual-write | Emission hookable + RabbitMQ simultanee | P0 (Phase 0b) |

**Ce qui n'est PAS couvert :**
- L'extraction de services (Phase 1+)
- L'API Gateway (GraphQL Mesh)
- Le saga pattern
- Les tables outbox/event_log (documente pour Phase 1+)

---

## 2. Architecture

### System Context

L'EventBus s'insere entre les modules metier et l'infrastructure de messaging, en offrant une API unique quel que soit le provider actif.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              c-zo Platform                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│   │ @czo/product│    │ @czo/order  │    │ @czo/auth   │  Domain Modules     │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                     │
│          │                  │                  │                             │
│          │  eventBus.publish('product.item.created', ...)                   │
│          │  eventBus.subscribe('order.checkout.*', handler)                 │
│          │                  │                  │                             │
│          └──────────────────┼──────────────────┘                             │
│                             │                                                │
│                             ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         @czo/kit                                     │   │
│   │                                                                      │   │
│   │  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐  ┌────────┐ │   │
│   │  │Repository│  │  Cache   │  │      EventBus          │  │ Queue  │ │   │
│   │  │          │  │          │  │  ┌──────────────────┐   │  │(BullMQ)│ │   │
│   │  │          │  │          │  │  │ EventBus iface   │   │  │        │ │   │
│   │  │          │  │          │  │  │ publish()        │   │  │        │ │   │
│   │  │          │  │          │  │  │ subscribe()      │   │  │        │ │   │
│   │  │          │  │          │  │  │ shutdown()       │   │  │        │ │   │
│   │  │          │  │          │  │  └───────┬──────────┘   │  │        │ │   │
│   │  │          │  │          │  │          │              │  │        │ │   │
│   │  │          │  │          │  │  ┌───────┴──────────┐   │  │        │ │   │
│   │  │          │  │          │  │  │    Providers      │   │  │        │ │   │
│   │  │          │  │          │  │  │ ┌──────┐┌──────┐ │   │  │        │ │   │
│   │  │          │  │          │  │  │ │Hooka-││Rabbit│ │   │  │        │ │   │
│   │  │          │  │          │  │  │ │ble   ││MQ    │ │   │  │        │ │   │
│   │  │          │  │          │  │  │ └──┬───┘└──┬───┘ │   │  │        │ │   │
│   │  │          │  │          │  │  └────┼───────┼─────┘   │  │        │ │   │
│   │  └────┬─────┘  └────┬─────┘  └──────┼───────┼─────────┘  └───┬────┘ │   │
│   └───────┼─────────────┼───────────────┼───────┼─────────────────┼──────┘   │
│           │             │               │       │                 │           │
│           ▼             ▼               ▼       ▼                 ▼           │
│   ┌───────────┐  ┌───────────┐  ┌─────────┐ ┌─────────┐  ┌───────────┐     │
│   │PostgreSQL │  │   Redis   │  │hookable │ │RabbitMQ │  │  Redis    │     │
│   │           │  │  (cache)  │  │(process)│ │ (AMQP)  │  │ (BullMQ) │     │
│   └───────────┘  └───────────┘  └─────────┘ └─────────┘  └───────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
Module Code (ProductService, OrderService, etc.)
       │
       ▼ EventBus.publish() / EventBus.subscribe()
┌──────────────────────────────────────────────────────────┐
│                  EventBus (Abstraction)                    │
│                                                           │
│  useEventBus() ──► singleton EventBus instance            │
│                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐      │
│  │   HookableEventBus   │  │  RabbitMQEventBus    │      │
│  │   (hookable provider)│  │  (rabbitmq provider) │      │
│  │                      │  │                      │      │
│  │  - Delegue a         │  │  - Connexion AMQP    │      │
│  │    createEvent-      │  │  - Declare exchanges │      │
│  │    Emitter()         │  │  - Publie sur topic  │      │
│  │  - In-process        │  │  - Bind queues       │      │
│  │  - Zero latence      │  │  - Consumer channels │      │
│  │  - Pattern matching  │  │  - Publisher confirms │      │
│  │    emule localement  │  │  - DLX configuration │      │
│  │                      │  │  - Reconnexion auto  │      │
│  └──────────┬───────────┘  └──────────┬───────────┘      │
│             │                         │                   │
└─────────────┼─────────────────────────┼───────────────────┘
              │                         │
     hookable (in-process,         AMQP 0.9.1 (reseau,
      meme thread Node.js)          TCP vers broker)
```

### Data Flow : Event de Domaine

#### Provider Hookable (Monolithe)

```
ProductService.createProduct()
       │
       │  1. eventBus.publish('product.item.created', payload, metadata)
       │
       ▼
  EventBus.publish()
       │
       │  2. Cree l'envelope DomainEvent { id, type, version, timestamp, ... }
       │
       ▼
  HookableEventBus._publish()
       │
       │  3. Resout les subscribers par pattern matching local
       │     'product.item.*' → match ✓
       │     'order.*'        → match ✗
       │
       ├──► SearchHandler.onProductCreated(domainEvent)    ← in-process, sequentiel
       ├──► AppHandler.onProductCreated(domainEvent)       ← in-process, sequentiel
       └──► (retour immediat au caller)
```

#### Provider RabbitMQ (Microservices)

```
ProductService.createProduct()
       │
       │  1. eventBus.publish('product.item.created', payload, metadata)
       │
       ▼
  EventBus.publish()
       │
       │  2. Cree l'envelope DomainEvent { id, type, version, timestamp, ... }
       │  3. Serialise en JSON
       │
       ▼
  RabbitMQEventBus._publish()
       │
       │  4. channel.publish('czo.events', 'product.item.created', buffer)
       │  5. Attend publisher confirm (ACK du broker)
       │
       ▼
  RabbitMQ Broker
       │
       │  6. Route via topic exchange 'czo.events'
       │     binding 'product.item.*' → search.indexing queue ✓
       │     binding '#'              → app.webhooks queue ✓
       │     binding 'order.*'        → non matche ✗
       │
       ├──► [search.indexing] ──► Search Service consumer
       └──► [app.webhooks]    ──► App Service consumer
```

#### Mode Dual-Write (Transition)

```
ProductService.createProduct()
       │
       │  eventBus.publish('product.item.created', payload, metadata)
       │
       ▼
  EventBus.publish()
       │
       │  DomainEvent envelope cree
       │
       ├──► HookableEventBus._publish()    ← traitement in-process (handlers existants)
       │       │
       │       ├──► SearchHandler
       │       └──► AppHandler
       │
       └──► RabbitMQEventBus._publish()    ← copie sur le broker (validation/monitoring)
                │
                ▼
           RabbitMQ Broker
                │
                └──► Queues (pas de consumers encore, ou monitoring uniquement)
```

### Composants

| Composant | Technologie | But | Statut | Dependances |
|-----------|-------------|-----|--------|-------------|
| `EventBus` interface | TypeScript | Contrat d'abstraction publish/subscribe | A faire | - |
| `DomainEvent<T>` | TypeScript | Envelope standard pour les events de domaine | A faire | - |
| `EventBusProvider` | TypeScript | Interface pour creer un EventBus | A faire | - |
| `HookableEventBus` | hookable | Provider monolithe, delegue a `createEventEmitter()` | A faire | hookable (existant) |
| `RabbitMQEventBus` | amqplib | Provider microservices, client AMQP | A faire | amqplib (nouveau) |
| `useEventBus()` | TypeScript | Singleton runtime (pattern `useQueue()`) | A faire | CzoConfig |
| `createDomainEvent()` | TypeScript | Factory pour l'envelope DomainEvent | A faire | - |
| `CzoConfig.eventBus` | TypeScript | Extension de la configuration | A faire | config.ts (existant) |
| `EventEmitter` | hookable | Emitter existant (Sprint-02, conserve) | Fait | hookable |

### Structure de Fichiers

```
packages/kit/src/
  event-bus/
    types.ts              # EventBus, DomainEvent, EventBusProvider, EventBusConfig
    domain-event.ts       # createDomainEvent() factory, validation Zod
    use-event-bus.ts      # useEventBus() runtime helper (singleton)
    providers/
      hookable.ts         # createHookableEventBus() — wraps createEventEmitter()
      rabbitmq.ts         # createRabbitMQEventBus() — AMQP client
    index.ts              # Public API exports
  events/                 # CONSERVE — EventEmitter hookable existant (Sprint-02)
    emitter.ts            # createEventEmitter() — inchange
    types.ts              # EventMap, EventHandler, EventContext — inchange
    index.ts              # useEvents() — inchange (backward compat)
  config.ts               # MODIFIE — ajout section eventBus
```

### Package Exports (Extension)

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./module": "./dist/module/index.mjs",
    "./graphql": "./dist/graphql/index.mjs",
    "./db": "./dist/db/index.mjs",
    "./cache": "./dist/cache/index.mjs",
    "./events": "./dist/events/index.mjs",
    "./queue": "./dist/queue/index.mjs",
    "./config": "./dist/config.mjs",
    "./event-bus": "./dist/event-bus/index.mjs"
  }
}
```

Le sous-export `./events` est conserve pour la retrocompatibilite. Le nouveau sous-export `./event-bus` est l'API recommandee pour les events de domaine.

---

## 3. API Specification

### 3.1 DomainEvent Envelope

L'envelope standard qui encapsule tous les events de domaine, quel que soit le provider.

```typescript
// @czo/kit/event-bus/types.ts

/**
 * Envelope standard pour tous les events de domaine.
 * Garantit l'interoperabilite entre providers (hookable, RabbitMQ)
 * et la tracabilite des events.
 */
export interface DomainEvent<T = unknown> {
  /** Identifiant unique de l'event (UUID v4, pour idempotence) */
  id: string

  /** Type de l'event = routing key (convention: <domaine>.<entite>.<action>) */
  type: string

  /** Version du schema de l'event (pour evolution sans breaking change) */
  version: number

  /** Timestamp ISO 8601 de l'emission */
  timestamp: string

  /** Identifiant du service emetteur (ex: 'catalog-service', 'monolith') */
  source: string

  /** ID de correlation pour le tracing distribue (propage depuis le contexte HTTP) */
  correlationId: string

  /** Payload specifique a l'event */
  data: T

  /** Metadata contextuel */
  metadata: EventMetadata
}

export interface EventMetadata {
  /** ID du shop concerne (multi-tenant) */
  shopId?: string

  /** ID de l'acteur qui a declenche l'event */
  actorId?: string

  /** Type d'acteur */
  actorType?: 'user' | 'app' | 'system'
}
```

#### Factory `createDomainEvent()`

```typescript
// @czo/kit/event-bus/domain-event.ts

import { z } from 'zod'

/** Schema Zod pour validation des DomainEvent entrants */
export const domainEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string().regex(/^[a-z]+\.[a-z_]+\.[a-z_]+$/),
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  source: z.string().min(1),
  correlationId: z.string().min(1),
  data: z.unknown(),
  metadata: z.object({
    shopId: z.string().optional(),
    actorId: z.string().optional(),
    actorType: z.enum(['user', 'app', 'system']).optional(),
  }),
})

export interface CreateDomainEventOptions<T> {
  type: string
  data: T
  metadata?: Partial<EventMetadata>
  /** Version du schema (default: 1) */
  version?: number
  /** Source emettrice (default: depuis la config) */
  source?: string
  /** CorrelationId a propager (default: nouveau UUID) */
  correlationId?: string
}

/**
 * Factory pour creer un DomainEvent avec les champs auto-generes.
 * Le correlationId est propage depuis le contexte si disponible.
 */
export function createDomainEvent<T>(
  options: CreateDomainEventOptions<T>,
): DomainEvent<T> {
  return {
    id: crypto.randomUUID(),
    type: options.type,
    version: options.version ?? 1,
    timestamp: new Date().toISOString(),
    source: options.source ?? 'monolith',
    correlationId: options.correlationId ?? crypto.randomUUID(),
    data: options.data,
    metadata: {
      shopId: options.metadata?.shopId,
      actorId: options.metadata?.actorId,
      actorType: options.metadata?.actorType,
    },
  }
}

/**
 * Valide un objet comme DomainEvent. Utile pour les consumers
 * qui recoivent des messages serialises (RabbitMQ).
 */
export function validateDomainEvent(input: unknown): DomainEvent {
  return domainEventSchema.parse(input) as DomainEvent
}
```

### 3.2 EventBus Interface

```typescript
// @czo/kit/event-bus/types.ts

import type { EventMap } from '../events/types'

/**
 * Type du handler de DomainEvent.
 * Recoit l'envelope DomainEvent complete (pas juste le payload).
 */
export type DomainEventHandler<T = unknown> = (
  event: DomainEvent<T>,
) => Promise<void>

/**
 * Fonction de desabonnement retournee par subscribe().
 */
export type Unsubscribe = () => Promise<void>

/**
 * Interface principale de l'EventBus.
 *
 * Les modules utilisent cette interface pour publier et consommer
 * des events de domaine, sans connaitre le provider sous-jacent.
 *
 * @example
 * ```ts
 * const bus = useEventBus()
 *
 * // Publication
 * await bus.publish('product.item.created', {
 *   productId: 'prod_01', title: 'T-Shirt Bio', handle: 't-shirt-bio',
 * }, { shopId: 'shop_01', actorId: 'user_01', actorType: 'user' })
 *
 * // Abonnement
 * const unsub = await bus.subscribe('product.item.*', async (event) => {
 *   console.log(event.type, event.data)
 * })
 *
 * // Desabonnement
 * await unsub()
 *
 * // Shutdown (fermeture des connexions)
 * await bus.shutdown()
 * ```
 */
export interface EventBus {
  /**
   * Publie un event de domaine.
   *
   * Le type K est contraint par EventMap pour les events connus,
   * mais accepte aussi les strings pour les events dynamiques.
   *
   * @param event - Type de l'event (routing key: <domaine>.<entite>.<action>)
   * @param payload - Donnees specifiques a l'event
   * @param metadata - Contexte optionnel (shopId, actorId, actorType)
   */
  publish<K extends string>(
    event: K,
    payload: K extends keyof EventMap ? EventMap[K] : unknown,
    metadata?: Partial<EventMetadata>,
  ): Promise<void>

  /**
   * S'abonne a un pattern d'events.
   *
   * Le pattern supporte les wildcards :
   * - '*' matche exactement un segment (ex: 'product.item.*' matche 'product.item.created')
   * - '#' matche zero ou plusieurs segments (ex: 'product.#' matche 'product.item.created')
   *
   * @param pattern - Pattern de routing key (supporte wildcards * et #)
   * @param handler - Fonction appelee pour chaque event matche
   * @returns Fonction de desabonnement asynchrone
   */
  subscribe(
    pattern: string,
    handler: DomainEventHandler,
  ): Promise<Unsubscribe>

  /**
   * Ferme les connexions proprement (AMQP channels, etc.).
   * Appele lors du shutdown de l'application.
   */
  shutdown(): Promise<void>
}
```

### 3.3 EventBusProvider Interface

```typescript
// @czo/kit/event-bus/types.ts

/**
 * Interface que chaque provider doit implementer.
 * Permet d'ajouter de nouveaux backends sans modifier le code consommateur.
 */
export interface EventBusProvider {
  /** Nom unique du provider */
  name: string

  /**
   * Cree une instance EventBus configuree pour ce provider.
   * La methode peut etre asynchrone (connexion reseau pour RabbitMQ).
   */
  createEventBus(config: EventBusConfig): Promise<EventBus>
}

/**
 * Configuration de l'EventBus, extraite de CzoConfig.
 */
export interface EventBusConfig {
  /** Provider actif */
  provider: 'hookable' | 'rabbitmq'

  /** Nom de la source emettrice (default: 'monolith') */
  source?: string

  /** Mode dual-write : emet sur hookable ET rabbitmq simultanement */
  dualWrite?: boolean

  /** Configuration specifique RabbitMQ */
  rabbitmq?: RabbitMQConfig
}

export interface RabbitMQConfig {
  /** URL de connexion AMQP (ex: 'amqp://czo:czo_dev@localhost:5672') */
  url: string

  /** Nom de l'exchange principal (default: 'czo.events') */
  exchange?: string

  /** Nom de l'exchange systeme (default: 'czo.system') */
  systemExchange?: string

  /** Nom du Dead Letter Exchange (default: 'czo.dlx') */
  dlxExchange?: string

  /** Nombre de messages prefetch par consumer (default: 10) */
  prefetch?: number

  /** Activer les publisher confirms (default: true) */
  publisherConfirms?: boolean

  /** Delai de reconnexion en ms (default: 5000) */
  reconnectDelay?: number

  /** Nombre max de tentatives de reconnexion (default: 10) */
  maxReconnectAttempts?: number
}
```

### 3.4 Extension de CzoConfig

```typescript
// @czo/kit/config.ts (MODIFIE)

export interface CzoConfig {
  databaseUrl: string
  redisUrl: string
  queue: {
    prefix: string
    defaultAttempts: number
  }
  /** Configuration de l'EventBus (Phase 0 microservices) */
  eventBus: EventBusConfigSection
}

export interface EventBusConfigSection {
  /** Provider actif: 'hookable' (default, monolithe) ou 'rabbitmq' (microservices) */
  provider: 'hookable' | 'rabbitmq'

  /** Source emettrice pour les DomainEvent (default: 'monolith') */
  source: string

  /** Mode dual-write hookable + RabbitMQ (default: false) */
  dualWrite: boolean

  /** Configuration RabbitMQ (requise si provider = 'rabbitmq' ou dualWrite = true) */
  rabbitmq: {
    /** URL AMQP (default: process.env.NITRO_CZO_RABBITMQ_URL) */
    url: string
    /** Exchange principal (default: 'czo.events') */
    exchange: string
    /** Prefetch count par consumer (default: 10) */
    prefetch: number
  }
}

export const czoConfigDefaults: CzoConfig = {
  databaseUrl: '',
  redisUrl: '',
  queue: {
    prefix: 'czo',
    defaultAttempts: 3,
  },
  eventBus: {
    provider: 'hookable',
    source: 'monolith',
    dualWrite: false,
    rabbitmq: {
      url: '',
      exchange: 'czo.events',
      prefetch: 10,
    },
  },
}
```

La fonction `useCzoConfig()` est etendue pour lire la section `eventBus` :

```typescript
export function useCzoConfig(): CzoConfig {
  try {
    const config = useRuntimeConfig()
    const czo = (config as any).czo as Partial<CzoConfig> | undefined
    return {
      databaseUrl: czo?.databaseUrl || process.env.DATABASE_URL || '',
      redisUrl: czo?.redisUrl || process.env.REDIS_URL || '',
      queue: {
        prefix: czo?.queue?.prefix ?? czoConfigDefaults.queue.prefix,
        defaultAttempts: czo?.queue?.defaultAttempts ?? czoConfigDefaults.queue.defaultAttempts,
      },
      eventBus: {
        provider: czo?.eventBus?.provider ?? czoConfigDefaults.eventBus.provider,
        source: czo?.eventBus?.source ?? czoConfigDefaults.eventBus.source,
        dualWrite: czo?.eventBus?.dualWrite ?? czoConfigDefaults.eventBus.dualWrite,
        rabbitmq: {
          url: czo?.eventBus?.rabbitmq?.url
            || process.env.NITRO_CZO_RABBITMQ_URL
            || '',
          exchange: czo?.eventBus?.rabbitmq?.exchange
            ?? czoConfigDefaults.eventBus.rabbitmq.exchange,
          prefetch: czo?.eventBus?.rabbitmq?.prefetch
            ?? czoConfigDefaults.eventBus.rabbitmq.prefetch,
        },
      },
    }
  }
  catch {
    return {
      databaseUrl: process.env.DATABASE_URL || '',
      redisUrl: process.env.REDIS_URL || '',
      queue: czoConfigDefaults.queue,
      eventBus: {
        ...czoConfigDefaults.eventBus,
        rabbitmq: {
          ...czoConfigDefaults.eventBus.rabbitmq,
          url: process.env.NITRO_CZO_RABBITMQ_URL || '',
        },
      },
    }
  }
}
```

### 3.5 HookableEventBus Provider

Le provider hookable encapsule l'`EventEmitter` existant (Sprint-02) derriere l'interface EventBus. C'est le provider par defaut en mode monolithe.

```typescript
// @czo/kit/event-bus/providers/hookable.ts

import type { DomainEvent, DomainEventHandler, EventBus, EventBusConfig, Unsubscribe } from '../types'
import { createEventEmitter } from '../../events/emitter'
import { createDomainEvent } from '../domain-event'

/**
 * Cree un EventBus qui delegue a l'EventEmitter hookable existant.
 *
 * Le pattern matching (wildcards * et #) est emule localement
 * en parcourant les subscriptions enregistrees.
 *
 * @example
 * ```ts
 * const bus = await createHookableEventBus({ provider: 'hookable', source: 'monolith' })
 * await bus.publish('product.item.created', { productId: '123' })
 * ```
 */
export async function createHookableEventBus(config: EventBusConfig): Promise<EventBus> {
  const emitter = createEventEmitter()
  const subscriptions = new Map<string, { pattern: string; handler: DomainEventHandler }>()
  let subCounter = 0

  /**
   * Verifie si une routing key matche un pattern avec wildcards.
   * '*' matche exactement un segment.
   * '#' matche zero ou plusieurs segments.
   */
  function matchPattern(pattern: string, routingKey: string): boolean {
    const patternParts = pattern.split('.')
    const keyParts = routingKey.split('.')

    let pi = 0
    let ki = 0

    while (pi < patternParts.length && ki < keyParts.length) {
      const pp = patternParts[pi]

      if (pp === '#') {
        // '#' en derniere position matche tout le reste
        if (pi === patternParts.length - 1) return true
        // '#' au milieu : essayer toutes les positions suivantes
        for (let skip = ki; skip <= keyParts.length; skip++) {
          if (matchPattern(
            patternParts.slice(pi + 1).join('.'),
            keyParts.slice(skip).join('.'),
          )) {
            return true
          }
        }
        return false
      }

      if (pp === '*') {
        // '*' matche exactement un segment
        pi++
        ki++
        continue
      }

      if (pp !== keyParts[ki]) {
        return false
      }

      pi++
      ki++
    }

    // Verifier que les deux sont consommes
    // Sauf si le reste du pattern est '#'
    if (pi < patternParts.length) {
      return patternParts.slice(pi).every(p => p === '#')
    }

    return ki === keyParts.length
  }

  return {
    async publish(event, payload, metadata) {
      const domainEvent = createDomainEvent({
        type: event,
        data: payload,
        metadata,
        source: config.source,
      })

      // Distribuer aux subscribers dont le pattern matche
      const promises: Promise<void>[] = []

      for (const [, sub] of subscriptions) {
        if (matchPattern(sub.pattern, event)) {
          promises.push(sub.handler(domainEvent))
        }
      }

      // Execution parallele des handlers (non-bloquant)
      await Promise.allSettled(promises)

      // Emettre aussi sur le hookable natif pour la retrocompatibilite
      // Les handlers enregistres via useEvents().on() continuent de fonctionner
      await emitter.emit(event, payload)
    },

    async subscribe(pattern, handler) {
      const id = `hookable_sub_${++subCounter}`
      subscriptions.set(id, { pattern, handler })

      const unsubscribe: Unsubscribe = async () => {
        subscriptions.delete(id)
      }

      return unsubscribe
    },

    async shutdown() {
      subscriptions.clear()
    },
  }
}
```

### 3.6 RabbitMQEventBus Provider

Le provider RabbitMQ utilise `amqplib` pour communiquer avec le broker via le protocole AMQP 0.9.1.

```typescript
// @czo/kit/event-bus/providers/rabbitmq.ts

import type { Channel, ConfirmChannel, Connection } from 'amqplib'
import type { DomainEvent, DomainEventHandler, EventBus, EventBusConfig, Unsubscribe } from '../types'
import { connect } from 'amqplib'
import { createDomainEvent, validateDomainEvent } from '../domain-event'

interface RabbitMQState {
  connection: Connection
  publishChannel: ConfirmChannel
  consumeChannel: Channel
  consumerTags: Map<string, string>
}

/**
 * Cree un EventBus qui communique via RabbitMQ.
 *
 * - Declare les exchanges au demarrage (czo.events, czo.system, czo.dlx)
 * - Utilise un ConfirmChannel pour les publisher confirms
 * - Cree un channel separe pour la consommation (isolation)
 * - Gere la reconnexion automatique
 *
 * @example
 * ```ts
 * const bus = await createRabbitMQEventBus({
 *   provider: 'rabbitmq',
 *   source: 'catalog-service',
 *   rabbitmq: {
 *     url: 'amqp://czo:czo_dev@localhost:5672',
 *     exchange: 'czo.events',
 *     prefetch: 10,
 *   },
 * })
 * ```
 */
export async function createRabbitMQEventBus(config: EventBusConfig): Promise<EventBus> {
  const rmqConfig = config.rabbitmq
  if (!rmqConfig?.url) {
    throw new Error(
      'RabbitMQ URL is required for rabbitmq provider. '
      + 'Set NITRO_CZO_RABBITMQ_URL or configure runtimeConfig.czo.eventBus.rabbitmq.url',
    )
  }

  const exchange = rmqConfig.exchange ?? 'czo.events'
  const dlxExchange = rmqConfig.dlxExchange ?? 'czo.dlx'
  const systemExchange = rmqConfig.systemExchange ?? 'czo.system'
  const prefetch = rmqConfig.prefetch ?? 10
  const useConfirms = rmqConfig.publisherConfirms ?? true

  let state: RabbitMQState | undefined
  let isShuttingDown = false

  async function ensureConnection(): Promise<RabbitMQState> {
    if (state) return state

    const connection = await connect(rmqConfig!.url)

    // Gestion de la reconnexion
    connection.on('error', (err) => {
      console.error('[EventBus:RabbitMQ] Connection error:', err.message)
      state = undefined
    })

    connection.on('close', () => {
      if (!isShuttingDown) {
        console.warn('[EventBus:RabbitMQ] Connection closed, will reconnect on next operation')
        state = undefined
      }
    })

    // Channel de publication avec publisher confirms
    const publishChannel = useConfirms
      ? await connection.createConfirmChannel()
      : await connection.createChannel() as unknown as ConfirmChannel

    // Channel de consommation separe (isolation)
    const consumeChannel = await connection.createChannel()
    await consumeChannel.prefetch(prefetch)

    // Declarer les exchanges
    await publishChannel.assertExchange(exchange, 'topic', {
      durable: true,
      autoDelete: false,
    })

    await publishChannel.assertExchange(systemExchange, 'fanout', {
      durable: true,
      autoDelete: false,
    })

    await publishChannel.assertExchange(dlxExchange, 'topic', {
      durable: true,
      autoDelete: false,
    })

    state = {
      connection,
      publishChannel,
      consumeChannel,
      consumerTags: new Map(),
    }

    return state
  }

  return {
    async publish(event, payload, metadata) {
      const { publishChannel } = await ensureConnection()

      const domainEvent = createDomainEvent({
        type: event,
        data: payload,
        metadata,
        source: config.source,
      })

      const buffer = Buffer.from(JSON.stringify(domainEvent))

      if (useConfirms) {
        // Publisher confirm : attend l'ACK du broker
        await new Promise<void>((resolve, reject) => {
          publishChannel.publish(
            exchange,
            event,               // routing key = event type
            buffer,
            {
              persistent: true,  // message persiste sur disque
              contentType: 'application/json',
              messageId: domainEvent.id,
              correlationId: domainEvent.correlationId,
              timestamp: Math.floor(Date.now() / 1000),
              headers: {
                'x-event-version': domainEvent.version,
                'x-event-source': domainEvent.source,
              },
            },
            (err) => {
              if (err) reject(err)
              else resolve()
            },
          )
        })
      }
      else {
        publishChannel.publish(
          exchange,
          event,
          buffer,
          {
            persistent: true,
            contentType: 'application/json',
            messageId: domainEvent.id,
            correlationId: domainEvent.correlationId,
          },
        )
      }
    },

    async subscribe(pattern, handler) {
      const { consumeChannel, consumerTags } = await ensureConnection()

      // Generer un nom de queue unique pour ce consumer
      // En production, on utilisera des noms stables par service
      const queueName = `${config.source ?? 'monolith'}.${pattern.replace(/[.*#]/g, '_')}`

      // Declarer la queue avec DLX
      const { queue } = await consumeChannel.assertQueue(queueName, {
        durable: true,
        deadLetterExchange: dlxExchange,
        deadLetterRoutingKey: pattern,
      })

      // Bind la queue a l'exchange avec le pattern
      await consumeChannel.bindQueue(queue, exchange, pattern)

      // Demarrer la consommation
      const { consumerTag } = await consumeChannel.consume(queue, async (msg) => {
        if (!msg) return

        try {
          const raw = JSON.parse(msg.content.toString())
          const domainEvent = validateDomainEvent(raw)
          await handler(domainEvent)
          consumeChannel.ack(msg)
        }
        catch (err) {
          console.error(`[EventBus:RabbitMQ] Handler error for ${pattern}:`, err)
          // NACK sans requeue (envoie vers DLX)
          consumeChannel.nack(msg, false, false)
        }
      })

      consumerTags.set(queueName, consumerTag)

      const unsubscribe: Unsubscribe = async () => {
        const s = await ensureConnection()
        const tag = s.consumerTags.get(queueName)
        if (tag) {
          await s.consumeChannel.cancel(tag)
          s.consumerTags.delete(queueName)
        }
      }

      return unsubscribe
    },

    async shutdown() {
      isShuttingDown = true

      if (state) {
        // Annuler tous les consumers
        for (const [, tag] of state.consumerTags) {
          try {
            await state.consumeChannel.cancel(tag)
          }
          catch {
            // Ignorer les erreurs de cancel pendant le shutdown
          }
        }
        state.consumerTags.clear()

        // Fermer les channels
        try { await state.publishChannel.close() }
        catch { /* ignore */ }
        try { await state.consumeChannel.close() }
        catch { /* ignore */ }

        // Fermer la connexion
        try { await state.connection.close() }
        catch { /* ignore */ }

        state = undefined
      }
    },
  }
}
```

### 3.7 useEventBus() Runtime Helper

Suivant le pattern etabli par `useQueue()` et `useWorker()` dans Sprint-02.

```typescript
// @czo/kit/event-bus/use-event-bus.ts

import type { EventBus, EventBusConfig } from './types'
import { useCzoConfig } from '../config'
import { createHookableEventBus } from './providers/hookable'

let instance: EventBus | undefined
let initPromise: Promise<EventBus> | undefined

/**
 * Retourne le singleton EventBus, initialise avec le provider
 * configure dans runtimeConfig.czo.eventBus.
 *
 * @example
 * ```ts
 * // Dans un plugin ou service
 * const bus = await useEventBus()
 * await bus.publish('product.item.created', payload, metadata)
 * ```
 */
export async function useEventBus(): Promise<EventBus> {
  if (instance) return instance

  // Eviter les initialisations concurrentes
  if (initPromise) return initPromise

  initPromise = initializeEventBus()
  instance = await initPromise
  initPromise = undefined

  return instance
}

async function initializeEventBus(): Promise<EventBus> {
  const { eventBus: ebConfig } = useCzoConfig()

  const config: EventBusConfig = {
    provider: ebConfig.provider,
    source: ebConfig.source,
    dualWrite: ebConfig.dualWrite,
    rabbitmq: ebConfig.rabbitmq.url
      ? {
          url: ebConfig.rabbitmq.url,
          exchange: ebConfig.rabbitmq.exchange,
          prefetch: ebConfig.rabbitmq.prefetch,
        }
      : undefined,
  }

  // Mode dual-write : hookable + rabbitmq en parallele
  if (config.dualWrite && config.rabbitmq?.url) {
    return createDualWriteEventBus(config)
  }

  // Provider unique
  switch (config.provider) {
    case 'rabbitmq': {
      // Import dynamique pour eviter de charger amqplib si non utilise
      const { createRabbitMQEventBus } = await import('./providers/rabbitmq')
      return createRabbitMQEventBus(config)
    }

    case 'hookable':
    default:
      return createHookableEventBus(config)
  }
}

/**
 * Cree un EventBus dual-write qui emet sur hookable ET RabbitMQ.
 * Les subscriptions sont gerees par le hookable uniquement
 * (les consumers RabbitMQ ne sont pas actifs en dual-write).
 */
async function createDualWriteEventBus(config: EventBusConfig): Promise<EventBus> {
  const hookable = await createHookableEventBus(config)

  const { createRabbitMQEventBus } = await import('./providers/rabbitmq')
  const rabbitmq = await createRabbitMQEventBus(config)

  return {
    async publish(event, payload, metadata) {
      // Hookable : traitement in-process (handlers existants)
      await hookable.publish(event, payload, metadata)

      // RabbitMQ : copie sur le broker (monitoring/validation)
      try {
        await rabbitmq.publish(event, payload, metadata)
      }
      catch (err) {
        // En dual-write, l'echec RabbitMQ ne bloque pas le hookable
        console.error('[EventBus:DualWrite] RabbitMQ publish failed:', err)
      }
    },

    // Les subscriptions passent par hookable uniquement en dual-write
    subscribe: hookable.subscribe,

    async shutdown() {
      await Promise.allSettled([
        hookable.shutdown(),
        rabbitmq.shutdown(),
      ])
    },
  }
}

/**
 * Reset le singleton EventBus.
 * Usage : tests uniquement.
 */
export function resetEventBus(): void {
  instance = undefined
  initPromise = undefined
}

/**
 * Shutdown graceful du singleton EventBus.
 * Appele lors du shutdown de l'application (hook czo:shutdown).
 */
export async function shutdownEventBus(): Promise<void> {
  if (instance) {
    await instance.shutdown()
    instance = undefined
    initPromise = undefined
  }
}
```

### 3.8 Public API Exports

```typescript
// @czo/kit/event-bus/index.ts

// Types
export type {
  DomainEvent,
  DomainEventHandler,
  EventBus,
  EventBusConfig,
  EventBusProvider,
  EventMetadata,
  RabbitMQConfig,
  Unsubscribe,
} from './types'

// Factory
export { createDomainEvent, domainEventSchema, validateDomainEvent } from './domain-event'

// Providers
export { createHookableEventBus } from './providers/hookable'
// Note: createRabbitMQEventBus est importe dynamiquement pour eviter
// de charger amqplib quand le provider hookable est utilise

// Runtime helper
export { resetEventBus, shutdownEventBus, useEventBus } from './use-event-bus'
```

### 3.9 Migration des Consumers Existants

Les modules qui utilisent `useEvents().on()` continuent de fonctionner sans modification. La migration vers `useEventBus().subscribe()` est optionnelle et progressive.

```typescript
// AVANT (Sprint-02, hookable direct)
import { useEvents } from '@czo/kit/events'

const events = useEvents()
events.on('product:created', async (payload, context) => {
  await indexProduct(payload)
})

// APRES (Phase 0, via EventBus)
import { useEventBus } from '@czo/kit/event-bus'

const bus = await useEventBus()
await bus.subscribe('product.item.created', async (event) => {
  // event est un DomainEvent complet
  await indexProduct(event.data)
  // Acces au correlationId, metadata, etc.
  console.log(`[${event.correlationId}] Product indexed: ${event.data.productId}`)
})
```

**Convention de nommage des events :**

| Ancien (hookable) | Nouveau (EventBus) | Raison |
|-------------------|-------------------|--------|
| `product:created` | `product.item.created` | Convention `<domaine>.<entite>.<action>` compatible routing RabbitMQ |
| `product:updated` | `product.item.updated` | Le separateur `.` est le standard AMQP |
| `product:deleted` | `product.item.deleted` | L'entite `item` distingue le produit de la collection |
| `product:published` | `product.item.published` | Coherence avec le reste de la convention |
| `app.started` | `system.app.started` | Les events systeme passent par `czo.system` (fanout) |

### 3.10 Declaration de Types (Module Augmentation)

```typescript
// @czo/product/events.ts — Exemple de declaration d'events metier

declare module '@czo/kit/event-bus' {
  interface EventBusEventMap {
    'product.item.created': {
      productId: string
      title: string
      handle: string
      status: 'draft' | 'active'
    }
    'product.item.updated': {
      productId: string
      changes: Record<string, unknown>
    }
    'product.item.deleted': {
      productId: string
    }
    'product.item.published': {
      productId: string
      channels: string[]
    }
    'product.collection.created': {
      collectionId: string
      title: string
      handle: string
    }
  }
}

// Note : EventBusEventMap etend EventMap existant pour la retrocompatibilite.
// Les deux interfaces coexistent pendant la migration.
```

---

## 4. Database Design

### Phase 0 : Aucune Nouvelle Table

La Phase 0 (EventBus abstraction) n'introduit aucune table en base de donnees. Les events hookable sont in-process ; les events RabbitMQ sont persistes par le broker.

### Phase 1+ : Tables Futures (Documentation)

Ces tables seront implementees dans les phases ulterieures.

#### `outbox_events` (Transactional Outbox Pattern)

Garantit que la publication d'un event est atomique avec la transaction DB. Le pattern outbox ecrit l'event en DB dans la meme transaction, puis un worker le publie sur RabbitMQ.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | text | PK | UUID de l'event |
| event_type | text | NOT NULL | Routing key (`product.item.created`) |
| payload | jsonb | NOT NULL | DomainEvent serialise |
| status | text | NOT NULL, DEFAULT 'pending' | `pending`, `published`, `failed` |
| attempts | integer | NOT NULL, DEFAULT 0 | Nombre de tentatives de publication |
| created_at | timestamptz | NOT NULL, DEFAULT NOW() | Heure de creation |
| published_at | timestamptz | NULL | Heure de publication sur RabbitMQ |
| error | text | NULL | Message d'erreur si echec |

**Index** : `INDEX(status, created_at)` pour le polling du worker outbox.

#### `event_log` (Debugging / Replay)

Journal immutable de tous les events publies, pour le debugging et le replay en cas d'incident.

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | text | PK | UUID de l'event (= DomainEvent.id) |
| event_type | text | NOT NULL | Routing key |
| version | integer | NOT NULL | Version du schema |
| source | text | NOT NULL | Service emetteur |
| correlation_id | text | NOT NULL | ID de correlation |
| payload | jsonb | NOT NULL | DomainEvent complet |
| metadata | jsonb | NOT NULL | Metadata (shopId, actorId, actorType) |
| created_at | timestamptz | NOT NULL, DEFAULT NOW() | Timestamp |

**Index** : `INDEX(event_type, created_at)`, `INDEX(correlation_id)`, `INDEX(metadata->>'shopId')`.

**Note** : ces tables ne sont implementees que lorsque le besoin est reel (Phase 1+ avec extraction de services). En Phase 0, le broker RabbitMQ et les logs structures suffisent pour la tracabilite.

---

## 5. Security

### Connexion AMQP

| Mesure | Description | Implementation |
|--------|-------------|----------------|
| **Credentials via runtimeConfig** | Les identifiants RabbitMQ sont stockes dans les variables d'environnement, jamais en dur dans le code | `NITRO_CZO_RABBITMQ_URL` contient l'URL avec credentials (`amqp://user:pass@host:5672`) |
| **TLS en production** | Connexion chiffree entre le service et le broker RabbitMQ | URL `amqps://` avec certificat CA configure dans les options `amqplib` |
| **vhost isolation** | Chaque environnement (dev, staging, prod) utilise un vhost RabbitMQ separe | URL avec vhost : `amqp://user:pass@host:5672/czo_prod` |
| **Permissions RabbitMQ** | L'utilisateur RabbitMQ a des permissions limitees par vhost | Configure via `rabbitmqctl set_permissions` |

### Securite des Messages

| Mesure | Description |
|--------|-------------|
| **Pas de PII dans les payloads** | Les events contiennent des IDs (productId, userId) mais jamais de donnees personnelles en clair (email, mot de passe, adresse). Les services resolvent les IDs localement. |
| **Signature des messages** | En Phase 1+ (inter-service), les messages sont signes avec HMAC-SHA256. Le header `x-event-signature` permet au consumer de verifier l'integrite et l'authenticite. |
| **Idempotence** | Le champ `DomainEvent.id` (UUID) permet aux consumers d'ignorer les messages deja traites (deduplication). |

### Monitoring DLX

| Mesure | Description |
|--------|-------------|
| **Alerting** | Un consumer sur la queue DLX envoie des alertes (Slack, PagerDuty) pour chaque message echoue |
| **Headers de debug** | Les messages DLX incluent `x-death-count`, `x-first-death-exchange`, `x-first-death-queue`, `x-first-death-reason` |
| **Reinection manuelle** | Via la Management UI RabbitMQ (http://localhost:15672) ou un endpoint admin |

### Threat Model Specifique EventBus

| Menace | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Injection de messages malveillants sur l'exchange | Faible | Eleve | Credentials RabbitMQ, vhost isolation, validation Zod sur reception |
| Perte de messages en transit | Faible | Eleve | Publisher confirms, persistent delivery, quorum queues (prod) |
| Replay de messages | Moyenne | Moyen | Idempotence via `DomainEvent.id`, deduplication dans le consumer |
| Denial of Service via flood de messages | Faible | Moyen | Prefetch count, rate limiting au publish, monitoring queue depth |
| Fuite de credentials AMQP | Faible | Eleve | Variables d'environnement, pas de credentials dans le code ou les logs |

---

## 6. Performance

### Objectifs de Performance

| Metrique | Hookable Provider | RabbitMQ Provider | Methode de Mesure |
|----------|-------------------|-------------------|-------------------|
| **Latence publish** | < 1ms (in-process) | < 5ms p50, < 10ms p95 | APM / histogram |
| **Latence subscribe delivery** | < 1ms (callback direct) | < 10ms p50 (network) | APM / histogram |
| **Throughput publish** | 100k+/sec (limite CPU) | 10k msg/sec (cible) | Benchmark vitest |
| **Overhead memoire** | Negligeable | ~20-50MB (connexion AMQP + buffers) | Process metrics |
| **Overhead CPU** | Zero (appel de fonction) | ~2-5% (serialisation JSON + TLS) | Process metrics |

### Provider Hookable : Zero Overhead

Le provider hookable delegue a `createEventEmitter()` qui utilise `hookable` de UnJS. Le cout est celui d'un appel de fonction synchrone avec resolution de hooks. L'ajout de l'envelope `DomainEvent` represente une allocation d'objet supplementaire (~500 bytes) par publish, negligeable.

### Provider RabbitMQ : Optimisations

| Optimisation | Description |
|-------------|-------------|
| **Channel pooling** | Un `ConfirmChannel` pour les publications, un `Channel` pour la consommation. Pas de creation de channel par message. |
| **Publisher confirms (batch)** | `amqplib` confirme les publishes par batch, pas un par un. Reduit les round-trips. |
| **Prefetch tuning** | `prefetch = 10` par defaut. Ajustable via config. Evite de surcharger un consumer lent. |
| **Serialisation JSON** | JSON natif (`JSON.stringify`). Si le throughput depasse 50k/sec, evaluer MessagePack ou Protobuf. |
| **Connexion persistante** | Une seule connexion TCP par process. `amqplib` utilise le multiplexage AMQP sur cette connexion. |
| **Lazy queues** | Les queues RabbitMQ sont declarees `durable: true`. En production, evaluer `x-queue-type: quorum` pour la replication. |

### Mode Dual-Write : Impact

En mode dual-write, chaque `publish()` effectue deux operations :
1. Emission hookable (< 1ms)
2. Emission RabbitMQ (< 5ms)

Le total est < 6ms p50, acceptable pour la validation. L'echec RabbitMQ ne bloque pas le hookable (fire-and-forget avec log d'erreur).

### Benchmarks Cibles

```typescript
// Benchmark a executer dans les tests d'integration
describe('EventBus Performance', () => {
  it('hookable: publie 10k events en < 100ms', async () => {
    const bus = await createHookableEventBus({ provider: 'hookable' })
    const start = performance.now()

    for (let i = 0; i < 10_000; i++) {
      await bus.publish('bench.test.event', { i })
    }

    const duration = performance.now() - start
    expect(duration).toBeLessThan(100)
  })

  it('rabbitmq: publie 1k events en < 5s', async () => {
    const bus = await createRabbitMQEventBus({
      provider: 'rabbitmq',
      rabbitmq: { url: process.env.RABBITMQ_URL! },
    })
    const start = performance.now()

    for (let i = 0; i < 1_000; i++) {
      await bus.publish('bench.test.event', { i })
    }

    const duration = performance.now() - start
    expect(duration).toBeLessThan(5_000)

    await bus.shutdown()
  })
})
```

---

## 7. Observability

### Propagation du correlationId

Le `correlationId` est le lien entre une requete HTTP et les events de domaine qu'elle declenche. Il doit etre propage a travers toutes les couches.

```
HTTP Request
  X-Correlation-Id: req_01HXY456
       │
       ▼
ProductService.createProduct()
       │
       │  eventBus.publish('product.item.created', payload, metadata)
       │  correlationId: req_01HXY456 (propage depuis le contexte HTTP)
       │
       ▼
DomainEvent {
  id: 'evt_01HXY789',
  type: 'product.item.created',
  correlationId: 'req_01HXY456',    ← meme ID que la requete HTTP
  ...
}
       │
       ▼ (RabbitMQ)
AMQP message properties:
  correlation_id: 'req_01HXY456'    ← propage dans les headers AMQP
       │
       ▼
Consumer (Search Service)
  log: { correlationId: 'req_01HXY456', action: 'indexProduct', productId: '...' }
       │
       ▼
Jaeger/Tempo trace:
  span: req_01HXY456 → product.item.created → search.index
```

### Metriques

| Metrique | Type | Labels | Description |
|----------|------|--------|-------------|
| `czo_eventbus_publish_total` | Counter | `event_type`, `provider`, `status` | Nombre total d'events publies |
| `czo_eventbus_publish_duration_ms` | Histogram | `event_type`, `provider` | Latence de publication |
| `czo_eventbus_subscribe_total` | Counter | `pattern`, `provider`, `status` | Nombre total d'events recus par les subscribers |
| `czo_eventbus_subscribe_duration_ms` | Histogram | `pattern`, `provider` | Latence de traitement d'un handler |
| `czo_eventbus_errors_total` | Counter | `event_type`, `provider`, `error_type` | Erreurs de publication ou de traitement |
| `czo_eventbus_dlx_depth` | Gauge | `queue` | Profondeur de la queue DLX (messages echoues) |
| `czo_eventbus_consumer_lag` | Gauge | `queue` | Nombre de messages non traites dans une queue |

### Logging Structure

Chaque operation EventBus produit un log structure (via `consola` ou le logger futur) :

```typescript
// Publication
{
  level: 'debug',
  message: 'EventBus publish',
  eventType: 'product.item.created',
  eventId: 'evt_01HXY789',
  correlationId: 'req_01HXY456',
  provider: 'hookable',
  source: 'monolith',
  durationMs: 0.5,
}

// Erreur de publication
{
  level: 'error',
  message: 'EventBus publish failed',
  eventType: 'product.item.created',
  provider: 'rabbitmq',
  error: 'Connection refused',
  correlationId: 'req_01HXY456',
}

// Reception d'un event
{
  level: 'debug',
  message: 'EventBus handler executed',
  pattern: 'product.item.*',
  eventType: 'product.item.created',
  eventId: 'evt_01HXY789',
  correlationId: 'req_01HXY456',
  durationMs: 12.3,
}
```

### OpenTelemetry (Phase 1+)

En Phase 1+ (quand les services sont distribues), chaque `publish()` et `subscribe()` cree un span OpenTelemetry :

```
Span: eventbus.publish
  Attributes:
    messaging.system: rabbitmq
    messaging.destination: czo.events
    messaging.operation: publish
    messaging.message.id: evt_01HXY789
    czo.event.type: product.item.created
    czo.correlation_id: req_01HXY456

Span: eventbus.process
  Attributes:
    messaging.system: rabbitmq
    messaging.source: czo.events
    messaging.operation: process
    messaging.message.id: evt_01HXY789
    czo.event.type: product.item.created
    czo.consumer.pattern: product.item.*
```

Ceci est documente mais non implemente en Phase 0. Le `correlationId` dans les logs suffit pour la tracabilite dans le monolithe.

---

## 8. Dependencies

### Nouvelles Dependances

| Package | Version | Type | But | Notes |
|---------|---------|------|-----|-------|
| `amqplib` | `^0.10.x` | peerDependency (optional) | Client AMQP pour le provider RabbitMQ | Import dynamique : non charge si le provider hookable est utilise |
| `@types/amqplib` | `^0.10.x` | devDependency | Types TypeScript pour amqplib | Necessaire pour le build |

### Dependances Existantes (Inchangees)

| Package | Version | But |
|---------|---------|-----|
| `hookable` | `^5.x` | Backend du provider hookable (existant, Sprint-02) |
| `bullmq` | `^5.x` | Queue de jobs internes (existant, Sprint-02, inchange) |
| `ioredis` | `^5.x` | Client Redis pour BullMQ et cache (existant) |
| `zod` | via modules | Validation des DomainEvent entrants (disponible via les modules) |

### Modifications de package.json

```json
{
  "peerDependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "nitro": "^2.0.0 || ^3.0.0",
    "amqplib": "^0.10.0"
  },
  "peerDependenciesMeta": {
    "bullmq": { "optional": true },
    "ioredis": { "optional": true },
    "nitro": { "optional": true },
    "amqplib": { "optional": true }
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.0"
  }
}
```

**Justification du peerDependency optionnel** : le provider hookable n'a besoin que de `hookable` (deja en `dependencies`). `amqplib` n'est charge que si le provider RabbitMQ est configure, via `import()` dynamique. Cela evite de forcer l'installation d'`amqplib` pour les utilisateurs qui restent en monolithe.

### Infrastructure

| Service | Image Docker | Ports | But |
|---------|-------------|-------|-----|
| RabbitMQ | `rabbitmq:3-management-alpine` | `5672` (AMQP), `15672` (Management UI) | Broker de messages pour le provider RabbitMQ |

#### Extension de docker-compose.dev.yml

```yaml
# docker-compose.dev.yml (ajout)
services:
  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"      # AMQP
      - "15672:15672"    # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: czo
      RABBITMQ_DEFAULT_PASS: czo_dev
      RABBITMQ_DEFAULT_VHOST: czo_dev
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  rabbitmq_data:
```

#### Configuration via runtimeConfig (nitro.config.ts)

```typescript
// apps/mazo/nitro.config.ts (extension)
export default defineNitroConfig({
  runtimeConfig: {
    czo: {
      // ... existant
      eventBus: {
        provider: 'hookable',           // Default: monolithe
        source: 'monolith',
        dualWrite: false,
        rabbitmq: {
          url: '',                       // NITRO_CZO_RABBITMQ_URL
          exchange: 'czo.events',
          prefetch: 10,
        },
      },
    },
  },
})
```

---

## 9. Testing Strategy

### Tests Unitaires

#### Interface Compliance (les deux providers)

```typescript
// event-bus/providers/hookable.test.ts
// event-bus/providers/rabbitmq.test.ts (avec mocks)

describe.each([
  ['hookable', createHookableEventBus],
])('EventBus Provider: %s', (name, factory) => {
  let bus: EventBus

  beforeEach(async () => {
    bus = await factory({ provider: name as any, source: 'test' })
  })

  afterEach(async () => {
    await bus.shutdown()
  })

  it('publie un event sans erreur', async () => {
    await expect(
      bus.publish('test.item.created', { id: '123' }),
    ).resolves.toBeUndefined()
  })

  it('delivre un event aux subscribers qui matchent', async () => {
    const received: DomainEvent[] = []

    await bus.subscribe('test.item.*', async (event) => {
      received.push(event)
    })

    await bus.publish('test.item.created', { id: '123' })

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('test.item.created')
    expect(received[0].data).toEqual({ id: '123' })
  })

  it('ne delivre pas aux subscribers non-matchants', async () => {
    const received: DomainEvent[] = []

    await bus.subscribe('other.item.*', async (event) => {
      received.push(event)
    })

    await bus.publish('test.item.created', { id: '123' })

    expect(received).toHaveLength(0)
  })

  it('construit un DomainEvent conforme', async () => {
    let captured: DomainEvent | undefined

    await bus.subscribe('test.item.created', async (event) => {
      captured = event
    })

    await bus.publish('test.item.created', { id: '123' }, {
      shopId: 'shop_01',
      actorId: 'user_01',
      actorType: 'user',
    })

    expect(captured).toBeDefined()
    expect(captured!.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(captured!.type).toBe('test.item.created')
    expect(captured!.version).toBe(1)
    expect(captured!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(captured!.correlationId).toBeTruthy()
    expect(captured!.metadata.shopId).toBe('shop_01')
    expect(captured!.metadata.actorId).toBe('user_01')
    expect(captured!.metadata.actorType).toBe('user')
  })

  it('supporte le pattern # (wildcard multi-segments)', async () => {
    const received: DomainEvent[] = []

    await bus.subscribe('product.#', async (event) => {
      received.push(event)
    })

    await bus.publish('product.item.created', { id: '1' })
    await bus.publish('product.collection.updated', { id: '2' })

    expect(received).toHaveLength(2)
  })

  it('desabonne via la fonction retournee', async () => {
    const received: DomainEvent[] = []

    const unsub = await bus.subscribe('test.item.*', async (event) => {
      received.push(event)
    })

    await bus.publish('test.item.created', { id: '1' })
    expect(received).toHaveLength(1)

    await unsub()

    await bus.publish('test.item.created', { id: '2' })
    expect(received).toHaveLength(1) // Toujours 1, pas 2
  })

  it('shutdown sans erreur', async () => {
    await expect(bus.shutdown()).resolves.toBeUndefined()
  })
})
```

#### DomainEvent Factory

```typescript
// event-bus/domain-event.test.ts

describe('createDomainEvent', () => {
  it('genere un id UUID', () => {
    const event = createDomainEvent({ type: 'test.item.created', data: {} })
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('genere un timestamp ISO 8601', () => {
    const event = createDomainEvent({ type: 'test.item.created', data: {} })
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp)
  })

  it('propage le correlationId fourni', () => {
    const event = createDomainEvent({
      type: 'test.item.created',
      data: {},
      correlationId: 'custom-id',
    })
    expect(event.correlationId).toBe('custom-id')
  })

  it('genere un correlationId si non fourni', () => {
    const event = createDomainEvent({ type: 'test.item.created', data: {} })
    expect(event.correlationId).toBeTruthy()
  })

  it('utilise version 1 par defaut', () => {
    const event = createDomainEvent({ type: 'test.item.created', data: {} })
    expect(event.version).toBe(1)
  })
})

describe('validateDomainEvent', () => {
  it('accepte un DomainEvent valide', () => {
    const event = createDomainEvent({ type: 'test.item.created', data: { id: '1' } })
    expect(() => validateDomainEvent(event)).not.toThrow()
  })

  it('rejette un objet invalide', () => {
    expect(() => validateDomainEvent({ foo: 'bar' })).toThrow()
  })

  it('rejette un type non conforme a la convention', () => {
    const event = createDomainEvent({ type: 'invalid', data: {} })
    expect(() => validateDomainEvent(event)).toThrow()
  })
})
```

#### Pattern Matching (Hookable Provider)

```typescript
// event-bus/providers/hookable.test.ts

describe('matchPattern', () => {
  it.each([
    ['product.item.created', 'product.item.created', true],
    ['product.item.*', 'product.item.created', true],
    ['product.item.*', 'product.item.updated', true],
    ['product.item.*', 'product.collection.created', false],
    ['product.#', 'product.item.created', true],
    ['product.#', 'product.collection.updated', true],
    ['product.#', 'order.item.created', false],
    ['#', 'product.item.created', true],
    ['#', 'anything.at.all', true],
    ['*.item.created', 'product.item.created', true],
    ['*.item.created', 'order.item.created', true],
    ['*.item.created', 'product.item.updated', false],
  ])('pattern "%s" vs key "%s" = %s', (pattern, key, expected) => {
    expect(matchPattern(pattern, key)).toBe(expected)
  })
})
```

### Tests d'Integration (RabbitMQ)

```typescript
// event-bus/providers/rabbitmq.integration.test.ts

describe('RabbitMQEventBus (integration)', () => {
  // Requiert un RabbitMQ local (docker-compose.dev.yml)
  // Ou testcontainers pour un RabbitMQ ephemere

  const rmqUrl = process.env.RABBITMQ_URL ?? 'amqp://czo:czo_dev@localhost:5672/czo_dev'
  let bus: EventBus

  beforeEach(async () => {
    bus = await createRabbitMQEventBus({
      provider: 'rabbitmq',
      source: 'test',
      rabbitmq: { url: rmqUrl, exchange: 'czo.events.test' },
    })
  })

  afterEach(async () => {
    await bus.shutdown()
  })

  it('publie et consomme un event via RabbitMQ', async () => {
    const received = new Promise<DomainEvent>((resolve) => {
      bus.subscribe('test.item.created', async (event) => {
        resolve(event)
      })
    })

    await bus.publish('test.item.created', { id: '123' })

    const event = await received
    expect(event.type).toBe('test.item.created')
    expect(event.data).toEqual({ id: '123' })
  })

  it('route correctement avec wildcards', async () => {
    const received: DomainEvent[] = []

    await bus.subscribe('test.item.*', async (event) => {
      received.push(event)
    })

    await bus.publish('test.item.created', { id: '1' })
    await bus.publish('test.item.updated', { id: '2' })
    await bus.publish('test.collection.created', { id: '3' })

    // Attendre le traitement
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(received).toHaveLength(2)
  })

  it('envoie les messages echoues vers le DLX', async () => {
    await bus.subscribe('test.item.created', async () => {
      throw new Error('Handler error')
    })

    await bus.publish('test.item.created', { id: '123' })

    // Verifier que le message est dans la DLX
    // (inspection via Management API ou consumer sur la DLX)
    await new Promise(resolve => setTimeout(resolve, 1000))
  })
})
```

### Tests du Dual-Write

```typescript
// event-bus/use-event-bus.test.ts

describe('Dual-Write EventBus', () => {
  it('emet sur les deux providers', async () => {
    // Mock la config pour activer dual-write
    const hookableReceived: DomainEvent[] = []
    const rmqReceived: DomainEvent[] = []

    // ... setup mocks ...

    const bus = await createDualWriteEventBus(config)
    await bus.publish('test.item.created', { id: '1' })

    expect(hookableReceived).toHaveLength(1)
    expect(rmqReceived).toHaveLength(1)
  })

  it('continue si RabbitMQ echoue', async () => {
    // Le hookable continue meme si RabbitMQ est down
    const hookableReceived: DomainEvent[] = []

    // Mock RabbitMQ qui echoue
    // ...

    const bus = await createDualWriteEventBus(config)
    await bus.publish('test.item.created', { id: '1' })

    expect(hookableReceived).toHaveLength(1)
    // Verifier le log d'erreur RabbitMQ
  })
})
```

### Contract Tests (DomainEvent Schema)

```typescript
// event-bus/contract.test.ts

describe('DomainEvent Contract', () => {
  it('chaque provider produit un DomainEvent valide', async () => {
    const providers = [
      await createHookableEventBus({ provider: 'hookable', source: 'test' }),
    ]

    for (const bus of providers) {
      let captured: DomainEvent | undefined

      await bus.subscribe('contract.test.event', async (event) => {
        captured = event
      })

      await bus.publish('contract.test.event', { foo: 'bar' }, {
        shopId: 'shop_01',
      })

      expect(captured).toBeDefined()
      // Valider contre le schema Zod
      expect(() => validateDomainEvent(captured)).not.toThrow()

      await bus.shutdown()
    }
  })
})
```

### Couverture Cible

| Composant | Couverture Min | Type de Tests |
|-----------|---------------|---------------|
| `domain-event.ts` | 95% | Unit |
| `providers/hookable.ts` | 90% | Unit |
| `providers/rabbitmq.ts` | 80% | Unit + Integration |
| `use-event-bus.ts` | 85% | Unit |
| **Total event-bus/** | **85%+** | - |

---

## 10. Rollout Plan

### Phase 0a : EventBus Abstraction + Hookable Provider

**Objectif :** Implementer l'abstraction EventBus avec le provider hookable comme drop-in replacement pour l'`EventEmitter` actuel.

**Scope :**
- [ ] Interface `EventBus` (`publish`, `subscribe`, `shutdown`)
- [ ] Interface `DomainEvent` envelope avec factory `createDomainEvent()`
- [ ] Validation Zod du schema DomainEvent
- [ ] Provider `HookableEventBus` avec pattern matching local (`*`, `#`)
- [ ] Helper `useEventBus()` (singleton, pattern `useQueue()`)
- [ ] Extension de `CzoConfig` avec la section `eventBus`
- [ ] Sous-export `@czo/kit/event-bus`
- [ ] Tests unitaires (85%+ couverture)
- [ ] L'`EventEmitter` existant (`@czo/kit/events`) est CONSERVE et continue de fonctionner

**Resultat :** les modules peuvent commencer a utiliser `useEventBus().publish()` a la place de `useEvents().emit()`. L'ancien systeme continue de fonctionner pour la retrocompatibilite. Aucun changement de comportement.

**Feature flag :** `runtimeConfig.czo.eventBus.provider = 'hookable'` (default)

### Phase 0b : RabbitMQ Provider + Dual-Write

**Objectif :** Ajouter le provider RabbitMQ et le mode dual-write pour valider la publication sur le broker sans impacter les handlers existants.

**Scope :**
- [ ] Provider `RabbitMQEventBus` (amqplib)
- [ ] Declaration des exchanges (`czo.events`, `czo.system`, `czo.dlx`)
- [ ] Publisher confirms pour la livraison garantie
- [ ] Reconnexion automatique
- [ ] Mode dual-write dans `useEventBus()`
- [ ] `amqplib` comme peerDependency optionnel
- [ ] RabbitMQ dans `docker-compose.dev.yml`
- [ ] Tests d'integration (RabbitMQ local)
- [ ] Documentation de la convention routing key `<domaine>.<entite>.<action>`

**Resultat :** en activant `dualWrite: true`, les events sont emis sur hookable (handlers existants) ET sur RabbitMQ (monitoring). Aucun consumer RabbitMQ n'est encore actif cote production.

**Feature flag :** `runtimeConfig.czo.eventBus.dualWrite = true`

### Phase 0c : Validation en Staging

**Objectif :** Valider que le dual-write fonctionne correctement pendant 3+ mois avant de considerer la migration vers des microservices.

**Actions :**
- [ ] Deployer en staging avec dual-write actif
- [ ] Monitoring : comparer le nombre d'events hookable vs messages RabbitMQ
- [ ] Monitoring : verifier que la Management UI RabbitMQ montre les messages attendus
- [ ] Monitoring : verifier qu'aucun message n'atterrit dans la DLX (pas d'erreurs)
- [ ] Performance : mesurer l'impact du dual-write (< 10ms p95 acceptable)
- [ ] Alerting : configurer des alertes pour la profondeur de la DLX

**Resultat :** confiance que RabbitMQ recoit tous les events correctement, sans perte ni erreur.

### Rollback

Le rollback est trivial a chaque phase :

| Phase | Rollback | Impact |
|-------|----------|--------|
| 0a | Revenir a `useEvents()` dans les modules migres | Aucun (les deux systemes coexistent) |
| 0b | Desactiver dual-write : `dualWrite: false` | Zero code change, config seulement |
| 0c | Idem 0b | Config seulement |

**Le point cle :** le switch entre providers se fait par configuration, pas par code. Changer `eventBus.provider` de `'rabbitmq'` a `'hookable'` suffit pour revenir au comportement monolithe.

---

## Appendix

### ADR-001 : EventBus Provider Pattern

**Contexte :** Nous devons ajouter un systeme d'events de domaine qui fonctionne en monolithe (hookable, in-process) et en microservices (RabbitMQ, reseau).

**Decision :** Utiliser un **provider pattern** (comme le TaskProvider de brainstorm-tasks.md) plutot qu'integrer directement RabbitMQ.

**Justification :**
- **Separation des concerns** : le code metier publie des events sans savoir quel broker les transporte
- **Testabilite** : le provider hookable est parfait pour les tests (pas d'infra externe)
- **Migration progressive** : le dual-write permet de valider RabbitMQ avant de couper hookable
- **Extensibilite** : un futur provider Kafka, Redpanda, ou NATS peut etre ajoute sans modifier les consumers
- **Precedent** : le meme pattern est utilise pour les tasks (BullMQ / Inngest / Trigger.dev)

**Alternatives rejetees :**
- Integration directe de `amqplib` dans les modules : couplage fort, pas testable sans broker
- Wrapper hookable qui publie aussi sur RabbitMQ : pas d'abstraction propre, difficult a maintenir

### ADR-002 : Topologie des Exchanges RabbitMQ

**Contexte :** Definir la topologie des exchanges et queues pour la communication inter-services.

**Decision :** Trois exchanges :
- `czo.events` (topic) : exchange principal pour tous les events de domaine
- `czo.system` (fanout) : events systeme broadcast a tous les services
- `czo.dlx` (topic) : Dead Letter Exchange pour les messages echoues

**Justification :**

| Exchange | Type | Raison |
|----------|------|--------|
| `czo.events` | topic | Le pattern matching (`product.item.*`, `#`) permet un routing flexible. Les consumers s'abonnent aux patterns qui les interessent sans modifier le producteur. |
| `czo.system` | fanout | Les events systeme (config reload, maintenance, shutdown) doivent etre recus par TOUS les services. Le fanout est le type le plus simple et le plus rapide pour ce cas. |
| `czo.dlx` | topic | Les messages echoues sont routes vers le DLX avec la meme routing key, ce qui permet un monitoring par type d'event. |

**Convention de routing key :** `<domaine>.<entite>.<action>`

Exemples :
```
product.item.created
product.item.updated
product.item.deleted
product.item.published
product.collection.created
order.checkout.completed
order.item.shipped
auth.user.registered
auth.session.created
payment.charge.succeeded
payment.charge.failed
inventory.stock.reserved
inventory.stock.low
```

### Topologie RabbitMQ Complete (Reference)

```
Producteurs                    Exchanges                        Queues & Consumers
                          ┌───────────────────────┐
Auth Service ────────────►│                       │
  auth.user.registered    │                       ├──► [notification.events]──► Notification Svc
  auth.user.login         │                       │      binding: auth.user.registered
  auth.org.created        │                       │      binding: order.checkout.completed
                          │                       │      binding: payment.charge.*
                          │                       │      binding: inventory.stock.low
Catalog Service ─────────►│                       │      binding: product.item.published
  product.item.*          │                       │
  product.collection.*    │   czo.events          ├──► [search.indexing]──► Search Svc
                          │   (topic exchange)    │      binding: product.item.*
                          │                       │      binding: product.collection.*
Order Service ───────────►│                       │
  order.checkout.*        │                       ├──► [order.payments]──► Order Svc
  order.item.*            │                       │      binding: payment.charge.*
  order.return.*          │                       │      binding: inventory.stock.reserved
                          │                       │      binding: inventory.stock.insufficient
Payment Service ─────────►│                       │
  payment.charge.*        │                       ├──► [payment.orders]──► Payment Svc
  payment.refund.*        │                       │      binding: order.checkout.completed
                          │                       │
Inventory Service ───────►│                       ├──► [inventory.orders]──► Inventory Svc
  inventory.stock.*       │                       │      binding: order.checkout.completed
                          │                       │      binding: payment.refund.completed
                          │                       │
                          │                       ├──► [catalog.events]──► Catalog Svc
                          │                       │      binding: inventory.stock.low
                          │                       │
                          │                       ├──► [app.webhooks]──► App Svc
                          │                       │      binding: # (TOUS les events)
                          └───────────────────────┘

                          ┌───────────────────────┐
Tout service ────────────►│   czo.system          ├──► Tous les services
  config.updated          │   (fanout exchange)   │    (une queue par service)
  maintenance.start       └───────────────────────┘
  shutdown.graceful

                          ┌───────────────────────┐
Messages echoues ────────►│   czo.dlx             ├──► [dlx.all]──► DLX Monitor
(apres max retries)       │   (topic exchange)    │
                          └───────────────────────┘
```

### NitroApp Integration

L'EventBus est initialise lors du boot de l'application Nitro et expose sur `NitroApp` :

```typescript
// Declaration de types (extension de NitroApp)
declare module 'nitro/types' {
  interface NitroApp {
    container: Container<Record<any, any>>
    events: EventEmitter   // Sprint-02 (conserve, backward compat)
    eventBus: EventBus     // Phase 0a (nouveau)
  }
}

// Plugin d'initialisation
// packages/kit/src/module/plugins/event-bus.ts

export default defineNitroPlugin(async (nitro) => {
  const bus = await useEventBus()
  ;(nitro as any).eventBus = bus

  // Shutdown graceful lors de la fermeture du serveur
  nitro.hooks.hook('close', async () => {
    await shutdownEventBus()
  })
})
```

### Relation avec les Composants Existants

```
┌─────────────────────────────────────────────────────────────────────┐
│                     @czo/kit — Vue d'ensemble                        │
│                                                                      │
│  Sprint-01 (fait)           Sprint-02 (fait)        Phase 0 (a faire)│
│  ┌──────────────┐           ┌──────────────┐        ┌──────────────┐ │
│  │  Repository   │           │  EventEmitter│        │   EventBus   │ │
│  │  Cache        │           │  (hookable)  │◄───────│  (abstraction│ │
│  │               │           │              │ wraps  │   layer)     │ │
│  │               │           │  Queue       │        │              │ │
│  │               │           │  (BullMQ)    │        │  Hookable    │ │
│  │               │           │              │        │  Provider    │ │
│  │               │           │  Worker      │        │  (adapte     │ │
│  │               │           │  (BullMQ)    │        │   EventEmit- │ │
│  │               │           │              │        │   ter)       │ │
│  │               │           │  Config      │        │              │ │
│  │               │           │              │        │  RabbitMQ    │ │
│  │               │           │              │        │  Provider    │ │
│  │               │           │              │        │  (amqplib)   │ │
│  └──────────────┘           └──────────────┘        └──────────────┘ │
│                                                                      │
│  Inchange                   Conserve,                 Nouveau,       │
│                             backward compat           couche au-     │
│                                                       dessus         │
└─────────────────────────────────────────────────────────────────────┘
```

**Regle importante :**
- `@czo/kit/events` (EventEmitter) est **CONSERVE** et continue d'etre l'API interne de l'emitter hookable
- `@czo/kit/event-bus` (EventBus) est la **NOUVELLE** API recommandee pour les events de domaine
- `@czo/kit/queue` (BullMQ) est **INCHANGE** -- les jobs background restent BullMQ, l'EventBus ne les remplace pas
- `@czo/kit/config` est **ETENDU** avec la section `eventBus`

### References

- [brainstorm-microservices.md](./brainstorm-microservices.md) -- Architecture, topologie RabbitMQ, strategie de migration
- [prd-microservices.md](./prd-microservices.md) -- Features, user stories, acceptance criteria
- [trd.md](./trd.md) -- TRD parent du module Kit
- [brainstorm-tasks.md](./brainstorm-tasks.md) -- Provider pattern pour les background tasks (reference)
- [brainstorm-split.md](./brainstorm-split.md) -- Decision de garder kit comme un seul package
- [sprints/sprint-03.md](./sprints/sprint-03.md) -- Separation des workers BullMQ
- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials) -- Exchanges, routing, dead letters
- [amqplib Documentation](https://amqp-node.github.io/amqplib/) -- Client AMQP pour Node.js
- [hookable Documentation](https://github.com/unjs/hookable) -- Backend du provider hookable
- [Strangler Fig Pattern (Martin Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
