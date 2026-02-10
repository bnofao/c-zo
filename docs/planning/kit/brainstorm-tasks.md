# Brainstorm: Task Queue Provider System

**Date:** 2026-02-09
**Participants:** Claude (Briana), Utilisateur
**Status:** Draft

---

## Problem Statement

### The Question

`@czo/kit/queue` is tightly coupled to BullMQ + ioredis. Every module that uses background jobs depends on a specific queue technology. If we want to support:

- **BullMQ** (self-hosted, Redis-based, pull workers)
- **Inngest** (event-driven, serverless-friendly, push-based)
- **Trigger.dev** (containerized, durable execution, CRIU checkpoints)
- **Sync** (no infrastructure, for dev/test)

...the current architecture requires rewriting consumer code for each backend.

### Why This Matters Now

- Sprint-02 just implemented the BullMQ queue/worker primitives
- Sprint-03 plans to separate workers into their own process
- Module developers are about to start defining background tasks (order processing, email sending, inventory sync)
- Locking in BullMQ-specific APIs now means painful migration later

### What Happens If We Do Nothing

Every module uses `useQueue()` and `useWorker()` directly with BullMQ-specific types. If we later want Inngest for serverless deployments or Trigger.dev for long-running jobs, every call site must be rewritten.

---

## Ecosystem Comparison

### BullMQ (Current)

- **Model**: Pull-based — Worker polls Redis for jobs via `BRPOPLPUSH`
- **Infrastructure**: Self-hosted Redis
- **Execution**: Long-polling in a Node.js process (same or separate from Nitro)
- **Strengths**: Mature, reliable, fine-grained control, rate limiting, job priorities, repeatable jobs
- **Weaknesses**: Requires Redis, workers must be managed, no built-in dashboard (needs Bull Board)

### Inngest

- **Model**: Push-based — Inngest server sends HTTP requests to your app's endpoint
- **Infrastructure**: Inngest Cloud or self-hosted Inngest server
- **Execution**: Your function receives an HTTP POST; no long-running process needed
- **Strengths**: Serverless-friendly, built-in step functions, event replay, fan-out, no worker management
- **Weaknesses**: Vendor coupling, latency on cold starts, less control over execution environment

### Trigger.dev

- **Model**: Container-based — Each task runs in an isolated container with CRIU checkpointing
- **Infrastructure**: Trigger.dev Cloud or self-hosted
- **Execution**: Containerized, can pause/resume via `wait.*` APIs (CRIU snapshots)
- **Strengths**: Long-running tasks (hours), built-in retries, real-time logs, TypeScript-native SDK
- **Weaknesses**: Container overhead, newer project, self-hosting is complex

### Comparison Matrix

| Feature | BullMQ | Inngest | Trigger.dev |
|---|---|---|---|
| Infrastructure | Redis (self-hosted) | Inngest server | Trigger.dev server |
| Execution model | Pull (long-poll) | Push (HTTP) | Container (isolated) |
| Worker process | Required (separate) | Not needed | Not needed |
| Serverless-friendly | No | Yes | Partial |
| Job priorities | Yes | Via event routing | Via queue config |
| Rate limiting | Built-in | Built-in | Via concurrency |
| Cron/repeatable | Yes | Yes | Yes |
| Step functions | Manual (job chains) | Native | Native (wait.*) |
| Dashboard | Bull Board (add-on) | Built-in | Built-in |
| TypeScript support | Full | Full | Full |
| Self-hostable | Yes (just Redis) | Yes (complex) | Yes (complex) |
| Maturity | Very mature | Growing | Growing |

---

## Current Architecture

```
                useQueue('orders')                  useWorker('orders', fn)
                      │                                    │
                      ▼                                    ▼
              ┌─────────────┐                     ┌──────────────┐
              │   BullMQ    │      Redis           │   BullMQ     │
              │   Queue     │ ◄───────────────────►│   Worker     │
              └─────────────┘                     └──────────────┘
```

- Direct BullMQ dependency at every call site
- Redis connection managed per-helper (`getConnection()`)
- No abstraction layer — consumer code is infrastructure code

---

## Proposed Architecture: Provider Pattern

### Design Principles

1. **Application code defines tasks, not queues** — `defineTask('send-email', handler)` is declarative
2. **Infrastructure is configuration** — Switch from BullMQ to Inngest by changing config, not code
3. **Progressive disclosure** — Simple tasks are simple; advanced features (priorities, cron) are opt-in
4. **Type safety** — Task input/output types flow through the entire chain
5. **Zero-infrastructure dev** — Sync provider runs tasks inline without Redis or external services

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Application Layer                                           │
│  defineTask('send-email', handler)                           │
│  useTaskClient().enqueue('send-email', { to, body })         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Abstraction Layer (Provider Interface)                       │
│  TaskProvider { enqueue, startWorkers, shutdown }             │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
  │   BullMQ    │  │   Inngest   │  │  Trigger.dev │
  │  Provider   │  │  Provider   │  │   Provider   │
  └─────────────┘  └─────────────┘  └──────────────┘
         │                │                 │
       Redis         Inngest API      Trigger API
```

---

## Types Layer

### Core Interfaces

```typescript
// packages/kit/src/tasks/types.ts

export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique task identifier (e.g., 'send-email', 'orders:process') */
  name: string
  /** The function that processes the task */
  handler: TaskHandler<TInput, TOutput>
  /** Optional configuration */
  options?: TaskOptions
}

export type TaskHandler<TInput, TOutput> = (
  input: TInput,
  context: TaskContext,
) => Promise<TOutput>

export interface TaskContext {
  /** Unique ID for this task execution */
  taskId: string
  /** Number of previous attempts (0 on first try) */
  attempt: number
  /** Signal that aborts on timeout or shutdown */
  signal: AbortSignal
  /** Emit progress (0-100) for UI feedback */
  progress: (percent: number) => void
  /** Structured logger scoped to this task */
  log: TaskLogger
}

export interface TaskOptions {
  /** Maximum retry attempts (default: from config) */
  maxAttempts?: number
  /** Backoff strategy */
  backoff?: { type: 'fixed' | 'exponential'; delay: number }
  /** Cron expression for repeatable tasks */
  cron?: string
  /** Task timeout in milliseconds */
  timeout?: number
  /** Concurrency limit for this task type */
  concurrency?: number
}

export interface TaskHandle<TOutput = unknown> {
  /** Provider-assigned job ID */
  id: string
  /** Wait for the task to complete and get the result */
  waitForCompletion: () => Promise<TOutput>
}

export interface TaskLogger {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}
```

### Provider Interface

```typescript
// packages/kit/src/tasks/types.ts (continued)

export interface TaskProvider {
  /** Provider name for logging/debugging */
  name: string

  /** Enqueue a task for execution */
  enqueue<TInput, TOutput>(
    taskName: string,
    input: TInput,
    opts?: EnqueueOptions,
  ): Promise<TaskHandle<TOutput>>

  /** Start processing registered tasks (called once at boot) */
  startWorkers(tasks: TaskDefinition[]): Promise<void>

  /** Graceful shutdown — drain current tasks, close connections */
  shutdown(): Promise<void>
}

export interface EnqueueOptions {
  /** Job priority (lower = higher priority). Provider-specific behavior. */
  priority?: number
  /** Delay before processing (ms) */
  delay?: number
  /** Deduplicate by this key — if a task with this key is already pending, skip */
  deduplicationKey?: string
}
```

---

## Registry Layer

```typescript
// packages/kit/src/tasks/registry.ts

const tasks = new Map<string, TaskDefinition>()

export function defineTask<TInput = unknown, TOutput = unknown>(
  name: string,
  handler: TaskHandler<TInput, TOutput>,
  options?: TaskOptions,
): TaskDefinition<TInput, TOutput> {
  const definition: TaskDefinition<TInput, TOutput> = { name, handler, options }
  tasks.set(name, definition as TaskDefinition)
  return definition
}

export function getRegisteredTasks(): TaskDefinition[] {
  return [...tasks.values()]
}

export function clearRegisteredTasks(): void {
  tasks.clear()
}
```

### Usage in modules

```typescript
// packages/modules/product/src/tasks/sync-inventory.ts
import { defineTask } from '@czo/kit/tasks'

interface SyncInput { productId: string; warehouseId: string }
interface SyncOutput { synced: boolean; quantity: number }

export default defineTask<SyncInput, SyncOutput>(
  'product:sync-inventory',
  async (input, ctx) => {
    ctx.log.info('Starting inventory sync', { productId: input.productId })
    ctx.progress(10)

    const result = await fetchWarehouseStock(input.warehouseId, input.productId)
    ctx.progress(50)

    await updateProductStock(input.productId, result.quantity)
    ctx.progress(100)

    return { synced: true, quantity: result.quantity }
  },
  { maxAttempts: 3, backoff: { type: 'exponential', delay: 1000 } },
)
```

---

## Client Layer

```typescript
// packages/kit/src/tasks/client.ts

let provider: TaskProvider | undefined

export function setTaskProvider(p: TaskProvider): void {
  provider = p
}

export function useTaskClient(): TaskProvider {
  if (!provider) {
    throw new Error(
      'No task provider configured. '
      + 'Set runtimeConfig.czo.tasks.provider or call setTaskProvider().',
    )
  }
  return provider
}
```

### Usage in application code

```typescript
// In an API handler
import { useTaskClient } from '@czo/kit/tasks'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const handle = await useTaskClient().enqueue('product:sync-inventory', {
    productId: body.productId,
    warehouseId: body.warehouseId,
  })

  return { jobId: handle.id, status: 'queued' }
})
```

---

## Provider Implementations

### BullMQ Provider

Wraps the existing `useQueue` / `useWorker` infrastructure:

```typescript
// packages/kit/src/tasks/providers/bullmq.ts

import type { TaskDefinition, TaskHandle, TaskProvider, EnqueueOptions } from '../types'
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'

export function createBullMQProvider(config: {
  redisUrl: string
  prefix?: string
  defaultAttempts?: number
}): TaskProvider {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
  const queues = new Map<string, Queue>()
  const workers: Worker[] = []

  function getQueue(name: string): Queue {
    let q = queues.get(name)
    if (!q) {
      q = new Queue(name, { connection, prefix: config.prefix })
      queues.set(name, q)
    }
    return q
  }

  return {
    name: 'bullmq',

    async enqueue(taskName, input, opts) {
      const queue = getQueue(taskName)
      const job = await queue.add(taskName, input, {
        priority: opts?.priority,
        delay: opts?.delay,
        attempts: config.defaultAttempts ?? 3,
        jobId: opts?.deduplicationKey,
      })
      return {
        id: job.id!,
        waitForCompletion: () => job.waitUntilFinished(queue.events),
      } satisfies TaskHandle
    },

    async startWorkers(tasks) {
      for (const task of tasks) {
        const worker = new Worker(
          task.name,
          async (job) => {
            const ctx = buildTaskContext(job)
            return task.handler(job.data, ctx)
          },
          {
            connection,
            prefix: config.prefix,
            concurrency: task.options?.concurrency ?? 1,
          },
        )
        workers.push(worker)
      }
    },

    async shutdown() {
      await Promise.all(workers.map(w => w.close()))
      await Promise.all([...queues.values()].map(q => q.close()))
      connection.disconnect()
    },
  }
}
```

### Sync Provider (Dev/Test)

Executes tasks inline — no Redis, no external services:

```typescript
// packages/kit/src/tasks/providers/sync.ts

export function createSyncProvider(): TaskProvider {
  const tasks = new Map<string, TaskDefinition>()

  return {
    name: 'sync',

    async enqueue(taskName, input) {
      const task = tasks.get(taskName)
      if (!task) throw new Error(`Unknown task: ${taskName}`)

      const ctx = buildSyncContext()
      const result = await task.handler(input, ctx)
      return {
        id: crypto.randomUUID(),
        waitForCompletion: () => Promise.resolve(result),
      }
    },

    async startWorkers(definitions) {
      for (const def of definitions) {
        tasks.set(def.name, def)
      }
    },

    async shutdown() {
      tasks.clear()
    },
  }
}
```

### Inngest Provider (Future)

```typescript
// packages/kit/src/tasks/providers/inngest.ts (sketch)

export function createInngestProvider(config: {
  eventKey: string
  signingKey?: string
}): TaskProvider {
  // Inngest is push-based: the Inngest server sends HTTP POST to your endpoint
  // enqueue() sends an event to Inngest; the function is triggered server-side
  // startWorkers() registers Inngest functions on the serve() endpoint
  // No long-running process needed

  return {
    name: 'inngest',

    async enqueue(taskName, input, opts) {
      // inngest.send({ name: taskName, data: input })
      // Returns a handle with event ID
    },

    async startWorkers(tasks) {
      // Register inngest.createFunction() for each task
      // Expose via serve() handler (Nitro route)
    },

    async shutdown() {
      // No-op for push-based provider
    },
  }
}
```

### Trigger.dev Provider (Future)

```typescript
// packages/kit/src/tasks/providers/trigger.ts (sketch)

export function createTriggerProvider(config: {
  apiKey: string
  apiUrl?: string
}): TaskProvider {
  // Trigger.dev uses its own SDK to define and trigger tasks
  // Tasks run in isolated containers on Trigger.dev infrastructure
  // Supports long-running tasks with CRIU checkpointing

  return {
    name: 'trigger',

    async enqueue(taskName, input, opts) {
      // tasks.trigger(taskName, input)
      // Returns a handle with run ID
    },

    async startWorkers(tasks) {
      // No-op — Trigger.dev discovers tasks via its own CLI/build
      // Tasks are registered via trigger.dev/sdk defineTask
    },

    async shutdown() {
      // No-op for cloud-based provider
    },
  }
}
```

---

## Bootstrap Integration

### Config Extension

```typescript
// In CzoConfig (packages/kit/src/config.ts)
export interface CzoConfig {
  databaseUrl: string
  redisUrl: string
  queue: {
    prefix: string
    defaultAttempts: number
  }
  tasks: {
    provider: 'bullmq' | 'sync' | 'inngest' | 'trigger'
  }
}
```

### Module Bootstrap

```typescript
// In kit module setup or plugin
import { getRegisteredTasks } from './tasks/registry'
import { setTaskProvider } from './tasks/client'
import { createBullMQProvider } from './tasks/providers/bullmq'
import { createSyncProvider } from './tasks/providers/sync'

function bootstrapTasks(config: CzoConfig): void {
  const provider = config.tasks.provider === 'bullmq'
    ? createBullMQProvider({
        redisUrl: config.redisUrl,
        prefix: config.queue.prefix,
        defaultAttempts: config.queue.defaultAttempts,
      })
    : createSyncProvider()

  setTaskProvider(provider)
}

// In worker process or boot hook:
const tasks = getRegisteredTasks()
await useTaskClient().startWorkers(tasks)
```

### Nitro Config

```typescript
// apps/mazo/nitro.config.ts
export default defineNitroConfig({
  runtimeConfig: {
    czo: {
      redisUrl: '',          // NITRO_CZO_REDIS_URL
      tasks: {
        provider: 'bullmq',   // NITRO_CZO_TASKS_PROVIDER
      },
    },
  },
})
```

---

## Migration Path

### Phase 1: Add Abstraction Layer (Sprint-03/04)

1. Create `packages/kit/src/tasks/` with types, registry, client
2. Implement BullMQ provider wrapping existing `useQueue`/`useWorker`
3. Implement Sync provider for tests
4. Keep `@czo/kit/queue` as-is for backward compat
5. New code uses `defineTask` / `useTaskClient`

### Phase 2: Migrate Existing Code

1. Replace direct `useQueue()` / `useWorker()` calls with `defineTask()` + `useTaskClient().enqueue()`
2. Move worker definitions to `server/workers/*.ts` convention
3. Update tests to use Sync provider (no Redis mocks needed)

### Phase 3: Add Providers (As Needed)

1. Inngest provider when serverless deployment is needed
2. Trigger.dev provider when long-running tasks are needed
3. Each provider is a separate optional import (tree-shaking friendly)

---

## Relationship to Existing Code

### What Changes

| Current | Proposed |
|---|---|
| `useQueue('name').add(data)` | `useTaskClient().enqueue('name', data)` |
| `useWorker('name', processor)` | `defineTask('name', handler)` |
| Direct BullMQ types in module code | Generic `TaskHandler` / `TaskContext` |
| Redis required for dev | Sync provider, no Redis needed |
| Tests mock BullMQ + ioredis | Tests use Sync provider directly |

### What Stays

- `@czo/kit/queue` sub-export remains for users who want direct BullMQ access
- Redis connection management stays in BullMQ provider
- `useCzoConfig()` provides connection strings to all providers
- Sprint-03 worker process separation applies to BullMQ provider

### How Events + Tasks Relate

```
EventEmitter (sync, in-process)     TaskProvider (async, potentially out-of-process)
     │                                       │
     ▼                                       ▼
emit('product:created', data)        enqueue('send-welcome-email', data)
     │                                       │
     ▼                                       ▼
All handlers run in current process   Handler runs in worker process / cloud
Serial execution via hookable         Concurrent execution per provider
Guaranteed delivery (in-memory)       Persistent (Redis / cloud queue)
```

**Pattern**: Events trigger tasks.

```typescript
// A module listens for events and dispatches tasks
emitter.on('order:paid', async (order) => {
  await useTaskClient().enqueue('send-receipt', { orderId: order.id })
  await useTaskClient().enqueue('update-inventory', { items: order.items })
})
```

---

## Risks and Assumptions

### Assumptions

- [ ] **BullMQ will remain the primary provider** for self-hosted deployments. The abstraction should not add overhead to the happy path.
- [ ] **Provider switching is a deployment decision**, not a per-task decision. All tasks use the same provider.
- [ ] **The `TaskContext` interface is sufficient** for all provider capabilities. Provider-specific features are opt-in extensions, not core.
- [ ] **Inngest and Trigger.dev providers are future work.** The interface should be designed to support them, but implementation is deferred.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Abstraction leaks provider-specific features | Medium | High | Keep TaskProvider interface minimal; expose provider-specific opts via generics |
| Over-engineering for providers we may never use | Medium | Medium | Start with BullMQ + Sync only; interface is cheap, implementations are the work |
| TaskContext doesn't map to Inngest's step API | Medium | Medium | Inngest's step functions may need a separate `defineStepTask()` helper |
| Performance overhead of abstraction layer | Low | Low | Provider pattern is a single function dispatch; negligible cost |
| Sync provider hides real concurrency bugs | Medium | High | Integration tests should also run with BullMQ provider in CI |

---

## Open Questions

- [ ] Should provider be configurable per-task (e.g., BullMQ for fast jobs, Trigger.dev for long-running ones)?
- [ ] Should `defineTask()` support step functions natively (Inngest/Trigger.dev pattern)?
- [ ] How does the tasks system interact with Sprint-03 worker process separation?
- [ ] Should the Sync provider support simulated delays for closer-to-production testing?
- [ ] Is `@czo/kit/tasks` a new sub-export, or does it replace `@czo/kit/queue`?

---

## Recommendation

**Start with BullMQ + Sync providers. Design the interface to support future providers but don't implement them until needed.**

The provider pattern adds minimal overhead (one level of indirection) while giving us:
1. **Testability** — Sync provider eliminates Redis from test setup
2. **Flexibility** — Switch providers by changing one config value
3. **Clean API** — `defineTask()` + `useTaskClient()` is simpler than raw BullMQ

The existing `@czo/kit/queue` stays as a low-level escape hatch for power users who need direct BullMQ access.

---

## Next Steps

- [ ] Get feedback on the Provider interface design
- [ ] Decide if this is Sprint-03 (alongside worker separation) or Sprint-04
- [ ] Implement types + registry + client + BullMQ provider + Sync provider
- [ ] Migrate one task (e.g., from product module) as proof of concept
- [ ] Write tests using Sync provider pattern
