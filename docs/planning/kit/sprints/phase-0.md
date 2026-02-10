---
name: "Phase 0 - Préparer le Monolithe"
milestone: 4
start_date: 2026-02-10
end_date: 2026-02-24
status: active
prd: kit-microservices
---

## Goals

- [ ] Implémenter l'abstraction EventBus avec provider pattern (hookable + RabbitMQ)
- [ ] Définir le standard DomainEvent<T> et les conventions de routing keys
- [ ] Mettre en place l'infrastructure RabbitMQ locale (Docker Compose + exchanges)

## Issues

| Issue | Title | Type | Priority | Status | Assignee |
|-------|-------|------|----------|--------|----------|
| #44 | EventBus Abstraction avec Provider Pattern | feature | high | open | - |
| #45 | Standard de Schema des Events de Domaine (DomainEvent) | feature | high | open | - |
| #46 | Infrastructure RabbitMQ (Docker + Exchanges) | feature | high | open | - |

## Capacity

- Team members: TBD
- Estimated velocity: 3 issues / 2 semaines
- Notes: Sprint focalisé sur les fondations de l'architecture event-driven

## Retrospective

<!-- Filled in after sprint completion -->

### What went well


### What could improve


### Action items

