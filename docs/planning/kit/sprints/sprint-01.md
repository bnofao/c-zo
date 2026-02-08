---
name: Sprint-01
milestone: 2
start_date: 2026-02-04
end_date: 2026-02-14
status: active
prd: kit
---

## Goals

- [x] Implémenter le système de Repository ~~(createQueries, createMutations)~~ → Classe abstraite `Repository`
- [x] Configurer le système de cache ~~(createCachedQueries, useCacheManager)~~ → Simplifié à `useCache`
- [x] Mettre en place l'infrastructure (package exports, peer deps)

## Pivot Decision (2026-02-08)

Durant ce sprint, un pivot a été fait :
- **Avant** : Builders fonctionnels séparés (`createQueries`, `createMutations`, etc.)
- **Après** : Classe abstraite `Repository<T,U,V>` avec hooks intégrés

Raison : Pragmatisme - utiliser du code existant éprouvé plutôt que recréer from scratch.

## Issues

| Issue | Title | Type | Priority | Status | Notes |
|-------|-------|------|----------|--------|-------|
| #28 | ~~Implement createQueries builder~~ | task | high | done | → Intégré dans `Repository.findFirst/findMany` |
| #29 | ~~Implement createCachedQueries~~ | task | high | cancelled | → Reporté, utiliser `useCache` directement |
| #30 | ~~Implement createMutations builder~~ | task | high | done | → Intégré dans `Repository.create/update/delete` |
| #31 | ~~Implement CacheManager~~ | task | high | done | → Simplifié à re-export `useStorage` |
| #37 | Configure package exports | task | medium | done | Exports consolidés dans db/index |
| #38 | Configure Redis storage | task | medium | open | À faire dans nitro.config.ts |
| - | Add optimistic locking (version) | task | high | done | Nouveau |
| - | Add soft delete support | task | high | done | Nouveau |
| - | Add nitro peer dependency | task | low | done | Nouveau |

## Deliverables

### Repository Class (`@czo/kit/db`)

```typescript
export abstract class Repository<T, U, V, TClient> {
  // Queries
  findFirst(opts?)           // Avec relations, soft-delete filter
  findMany(opts?)            // Avec pagination, soft-delete filter
  paginateByOffset(opts?)    // Pagination page/perPage

  // Mutations
  create(value, opts?)       // Auto version: 1
  createMany(values, opts?)
  update(value, opts?)       // Avec expectedVersion pour locking
  delete(opts?)              // soft?: boolean
  restore(opts?)             // Annuler soft delete

  // Hooks (override)
  beforeCreate, afterCreate, beforeUpdate, afterUpdate, afterDelete, afterFind
}

export class OptimisticLockError extends Error { ... }
export class DatabaseError extends Error { ... }
```

### Cache (`@czo/kit/cache`)

```typescript
export { useStorage as useCache } from 'nitro/storage'
```

## Capacity

- Team members: 1
- Sprint duration: 10 jours ouvrés (2 semaines)
- Velocity: Objectifs atteints avec pivot

## Retrospective

### What went well

- Pivot rapide vers une approche pragmatique
- Optimistic locking et soft delete implémentés
- Build et exports fonctionnels

### What could improve

- Planification initiale trop ambitieuse (builders séparés)
- Documentation du pivot plus tôt

### Action items

- [ ] Mettre à jour le PRD/TRD avec le nouveau design
- [ ] Migrer un module existant (Product) vers le nouveau Repository
- [ ] Configurer Redis storage (#38)
