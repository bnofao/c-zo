---
name: Sprint-03
milestone: 4
start_date: 2026-02-23
end_date: 2026-03-06
status: planning
prd: kit
---

## Goals

- [ ] Decouple BullMQ workers from Nitro process (separate Node process)
- [ ] CLI command `czo workers` for dev/start modes
- [ ] Convention-based worker discovery (`server/workers/*.ts`)
- [ ] Build hook to generate worker entry point
- [ ] Nitro-native runtimeConfig integration (`runtimeConfig.czo`)

## Context

Currently, `useWorker()` runs inside the Nitro process. This couples background jobs to the HTTP server — a CPU-intensive job can starve request handling, and a worker OOM kills the entire API.

**Inspiration**: [nuxt-processor](https://github.com/aidanhibbard/nuxt-processor) — separate Node process for workers, auto-discovery of worker files, CLI with HMR for dev, graceful shutdown.

**Prerequisite**: Sprint-02 (EventEmitter + BullMQ queue system) must be complete. The `runtimeConfig.czo` migration (feat/kit-sprint-02-events branch) provides the config foundation.

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| TBD | Implement worker-runner entry point | task | high | open | - |
| TBD | Implement `czo workers:dev` CLI command | task | high | open | - |
| TBD | Implement `czo workers:start` CLI command | task | medium | open | - |
| TBD | Add build hook for worker entry generation | task | high | open | - |
| TBD | Convention-based worker file discovery | task | medium | open | - |
| TBD | Graceful shutdown (SIGINT/SIGTERM) | task | high | open | - |
| TBD | Worker filtering via `--workers=name1,name2` | task | low | open | - |
| TBD | Documentation and migration guide | docs | medium | open | - |

## Architecture

### Process Separation

```
┌─ Process 1: Nitro Server ─────────────┐     ┌─ Process 2: Worker Runner ──────────┐
│                                        │     │                                      │
│  useQueue('orders').add(job)           │     │  useWorker('orders', processor)       │
│  useQueue('emails').add(job)     ──────┼─▸   │  useWorker('emails', processor)       │
│                                   Redis│     │                                      │
│  HTTP, GraphQL, SSR                    │     │  No HTTP server                       │
│  Config via: runtimeConfig.czo         │     │  Config via: process.env fallback     │
│                                        │     │                                      │
└────────────────────────────────────────┘     └──────────────────────────────────────┘
```

### File Convention

```
apps/mazo/
  server/
    workers/
      orders.ts          # defineWorker('orders', processor)
      emails.ts          # defineWorker('emails', processor)
      inventory.ts       # defineWorker('inventory', processor)
```

### Generated Output

```
.output/
  server/
    workers/
      _entry.mjs         # Auto-generated: imports all workers, starts them
      index.mjs           # Wrapper: lifecycle management, graceful shutdown
```

### CLI Commands

```bash
# Development (HMR via --watch)
czo workers:dev                    # Start all workers with file watching
czo workers:dev --workers=orders   # Start only specific workers

# Production
czo workers:start                  # Run .output/server/workers/index.mjs
czo workers:start --workers=orders,emails
```

## Technical Design

### 1. `defineWorker()` helper

```typescript
// packages/kit/src/queue/define-worker.ts
import type { Processor, WorkerOptions } from 'bullmq'

export interface WorkerDefinition<D = unknown, R = unknown> {
  name: string
  processor: Processor<D, R>
  options?: Omit<WorkerOptions, 'connection'>
}

export function defineWorker<D = unknown, R = unknown>(
  name: string,
  processor: Processor<D, R>,
  options?: Omit<WorkerOptions, 'connection'>,
): WorkerDefinition<D, R> {
  return { name, processor, options }
}
```

### 2. Worker Runner (`packages/kit/src/worker-runner.ts`)

```typescript
// Entry point for the worker process
// - Scans worker definitions
// - Creates BullMQ workers via useWorker()
// - Handles graceful shutdown
// - Supports --workers=name1,name2 filtering

export async function startWorkers(definitions: WorkerDefinition[]): Promise<void>
export async function shutdownWorkers(): Promise<void>
```

### 3. Build Hook (Nitro module)

During `nitro:build:before`, scan `server/workers/*.ts` and generate:
- `.output/server/workers/_entry.mjs` — dynamic imports of all worker files
- `.output/server/workers/index.mjs` — lifecycle wrapper with signal handlers

### 4. CLI integration (extend existing `czo` CLI via citty)

```typescript
// packages/kit/src/commands/workers.ts
// Subcommands: dev, start
// Dev mode: node --watch .nuxt/dev/workers/index.mjs
// Prod mode: node .output/server/workers/index.mjs
```

### 5. Config resolution in worker process

The `useCzoConfig()` helper (from Sprint-02 runtimeConfig migration) already handles this:
- Inside Nitro: reads `runtimeConfig.czo`
- Outside Nitro (worker process): catches `useRuntimeConfig()` error, falls back to `process.env`

No changes needed — the worker process uses `REDIS_URL`, `DATABASE_URL` directly.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Worker file discovery misses files | Workers don't start | Explicit registration fallback + clear error messages |
| Dev HMR causes connection leaks | Redis connection exhaustion | `closeWorkers()` before re-import on file change |
| Worker crash doesn't restart | Jobs stuck in queue | Document process manager (PM2, systemd, Docker restart policy) |
| Shared code imports Nitro-only APIs | Worker process crashes at boot | `useCzoConfig()` try/catch already handles this; lint rule for worker files |

## Capacity

- Team members: 1
- Sprint duration: 10 working days (2 weeks)
- Estimated velocity: 4-6 issues (based on Sprint-01 and Sprint-02)
- Notes: Heavy infrastructure work. CLI + build hooks are new patterns for this codebase.

## Dependencies

- Sprint-02 complete (EventEmitter, BullMQ queue, `useCzoConfig`)
- `citty` CLI framework (already in kit dependencies)
- `bullmq` + `ioredis` (already peer dependencies)

## Definition of Done

- [ ] `czo workers:dev` starts workers in a separate process with HMR
- [ ] `czo workers:start` runs production workers from build output
- [ ] Workers use `process.env` for config (no Nitro runtime dependency)
- [ ] Graceful shutdown on SIGINT/SIGTERM closes all BullMQ workers
- [ ] `--workers=name` flag filters which workers start
- [ ] 80%+ test coverage on new code
- [ ] Documentation with examples

## Retrospective

<!-- Filled in after sprint completion -->

### What went well


### What could improve


### Action items

