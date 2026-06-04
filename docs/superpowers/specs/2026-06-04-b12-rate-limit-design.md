# B12 — Rate-limiting (REST credentials + GraphQL token-flows)

**Date:** 2026-06-04
**Backlog item:** B12 (priorité moyenne) — "GraphQL-wide rate-limit"
**Status:** design approved, pending spec review

## Problem

Le cooldown 60s côté tokens (`requestPasswordReset` / `requestEmailVerification` /
`requestEmailChange`, par-user, en DB) ne couvre pas le DoS générique. En particulier :

- `POST /api/auth/sign-in` (route REST h3, **pas** une mutation GraphQL) peut être
  brute-forcé sans aucun gate.
- `POST /api/auth/sign-up` peut spammer la création de comptes / l'envoi d'emails.
- Les `request*` token-flows GraphQL n'ont qu'une limite **par-compte** (cooldown
  60s) — un attaquant peut email-bomber un compte cible en variant la source, ou
  itérer sur des emails depuis une seule IP.

Bloquant si l'API est exposée publiquement sans WAF.

## Goals

Ajouter une limite de débit sur les surfaces sensibles **non-authentifiées** :

| Surface | Type | Vecteur |
|---|---|---|
| `/api/auth/sign-in` | REST | brute-force credentials |
| `/api/auth/sign-up` | REST | spam comptes / email-bomb |
| `requestPasswordReset` | GraphQL | email-bomb |
| `requestEmailVerification` | GraphQL | email-bomb |
| `requestEmailChange` | GraphQL | email-bomb |

**Hors périmètre** (différés) : `startImpersonation`, `createApiKey` — authentifiés,
déjà derrière une autz forte (admin / rôle). `resetPassword` / `verifyEmail` /
`confirmEmailChange` consomment un token cryptographique (espace de recherche
infaisable) — pas prioritaires.

## Non-goals

- Pas de store distribué (Redis) dans ce sprint. Le code est écrit **store-agnostique**
  des deux côtés ; le passage Redis est un swap de layer/config ultérieur (multi-instance).
- Pas de protection des mutations authentifiées (déjà gated par autz).
- Pas de mitigation anti-timing-leak (c'est B13, séparé).

## Architecture — deux mécanismes

Décision produit : **Effect `RateLimiter` côté REST**, **Pothos directives plugin +
`graphql-rate-limit-directive` côté GraphQL**. Deux stores indépendants (assumé) —
chacun basculable Redis séparément.

### 1. REST credentials — Effect `RateLimiter`

`RateLimiter` d'Effect 4 (`effect/unstable/persistence`) : service keyé,
`consume({ key, limit, window, algorithm, onExceeded })`, store pluggable.

- **Nouveau concern kit** : `packages/kit/src/ratelimit/` exposant le service
  `RateLimiter` sur un `RateLimiterStore`. Layer de boot :
  `RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))` maintenant ;
  `layerStoreRedisConfig` plus tard. Provisionné dans `app.ts` (prod) **et**
  `boot.ts` (tests), exactement comme `Persistence.layerMemory` l'est déjà.
- **`credential.ts`** (sign-in, sign-up) : en tête de l'Effect, **deux** `consume`
  avec `onExceeded: 'fail'`, `algorithm: 'fixed-window'` :
  - par-IP (large) — `key = "auth:signin:ip:<ip>"`, ex. **limit 20 / window 60s**
  - par-email (stricte) — `key = "auth:signin:email:<email>"`, ex. **limit 5 / window 60s**

  (sign-up : `key = "auth:signup:ip:<ip>"` large + `"auth:signup:email:<email>"`
  stricte ; mêmes ordres de grandeur, réglés au plan.)
- **IP** : `getRequestIP(event, { xForwardedFor: true })` (h3), dispo directement
  dans le handler REST.
- **Réponse au refus** : intercepter `RateLimiterError` (reason `RateLimitExceeded`)
  → **HTTP 429** + header `Retry-After` (depuis `reason.retryAfter`). Corps minimal,
  pas de fuite d'info (ne pas révéler quelle limite — IP vs email — a sauté).

### 2. GraphQL token-flows — Pothos directives + transformer

- **`@pothos/plugin-directives`** ajouté au builder kit (`builder.ts`). Directive
  déclarée dans le générique `Directives` : `rateLimit: { locations: 'FIELD_DEFINITION';
  args: { limit: number; duration: number } }`, builder configuré avec
  `directives: { useGraphQLToolsUnorderedDirectives: true }`.
- **`graphql-rate-limit-directive`** (ravangen) : `rateLimitDirective({ keyGenerator })`
  → `{ rateLimitDirectiveTypeDefs, rateLimitDirectiveTransformer }`. Dans `app.ts`,
  après `builder.toSchema()`, appliquer `rateLimitDirectiveTransformer(schema)` avant
  de passer le schéma à `createYoga`. Store par défaut `rate-limiter-flexible`
  (in-memory) ; Redis en option plus tard.
- **`keyGenerator`** : keyé **par IP** (lit l'IP via le contexte — voir Intégration).
  La lib préfixe déjà la clé par coordonnée de champ → isolation par mutation gratuite.
- **Annotation des champs** : `directives: { rateLimit: { limit: 5, duration: 60 } }`
  sur `requestPasswordReset`, `requestEmailVerification`, `requestEmailChange`.
- **Couche compte** : le cooldown 60s/user existant (DB) **reste** la limite
  par-identifiant. Donc GraphQL = IP (directive) + compte (cooldown existant) —
  cohérent avec la décision "les deux clés", sans dupliquer la logique compte.

## Points d'intégration à verrouiller au plan

1. **`relayMutationField` + directives** — les 3 mutations cibles passent par le
   helper kit `builder.relayMutationField(name, input, fieldOpts, output)`, pas
   `t.field`. Vérifier que `directives` se propage via `fieldOpts` (le 3e argument) ;
   sinon, ajouter le passage de `directives` dans le wrapper du helper.
2. **Double-définition de `@rateLimit`** — Pothos (plugin-directives) émet la
   définition + l'usage de la directive ; `rateLimitDirectiveTransformer` attend de
   la trouver via `getDirective`. Verrouiller pour éviter une définition en double
   (ne PAS aussi merger `rateLimitDirectiveTypeDefs` si Pothos l'émet déjà ; ou
   inversement). Test de fumée : `builder.toSchema()` + transformer ne throw pas.
3. **Plumbing IP côté GraphQL** — `keyGenerator(_, __, ___, context)` doit lire l'IP.
   Exposer `clientIp` sur le contexte GraphQL (dérivé une fois à la construction du
   contexte yoga depuis `x-forwarded-for` / la requête) plutôt que de re-parser les
   headers à chaque resolver.
4. **Modèle d'erreur GQL** — le refus du transformer remonte en **erreur d'exécution
   GraphQL standard** (pas l'union typée Effect des mutations). Acceptable et
   documenté ; on ne mappe pas vers une union typée dans ce sprint.

## Testing

Tests E2E via le harness `bootTestApp` (`@czo/kit/testing`, Testcontainers + vrai
fetch in-process) — les deux stores in-memory sont réinitialisés par scope de test
(nouvelle app/container par suite).

- **REST** (`bootTestApp([auth])`) :
  - N+1 `POST /api/auth/sign-in` depuis la même IP (mauvais mot de passe) → la
    N+1ᵉ renvoie **429** + `Retry-After`, pas `401`.
  - Dépassement de la limite par-email depuis des IPs variées → 429 (prouve le
    second `consume`).
  - Sous le seuil → comportement normal (401 sur mauvais creds, 200 sur bons).
- **GraphQL** (`bootTestApp([auth])`) :
  - N+1 `requestPasswordReset` depuis la même IP → la N+1ᵉ échoue avec l'erreur
    rate-limit.
  - Sous le seuil → `{ success: true }`.
- **Unit** (kit) : le layer `RateLimiter` (memory) `consume` au-delà du seuil →
  `RateLimiterError(RateLimitExceeded)` ; sous le seuil → `ConsumeResult` avec
  `remaining` décroissant.

## Dépendances ajoutées

- `@pothos/plugin-directives` (catalog, version alignée sur les autres plugins Pothos `^4.x`)
- `graphql-rate-limit-directive` (+ son peer `rate-limiter-flexible`)
- `effect/unstable/persistence` RateLimiter : déjà dans `effect@4.0.0-beta.70`, pas de nouvelle dep.

## Fichiers touchés (estimation)

- `packages/kit/src/ratelimit/*` — nouveau concern (service + layers memory/redis-ready)
- `packages/kit/src/module/app.ts` — provide RateLimiter layer ; appliquer le transformer au schéma ; exposer `clientIp` au contexte
- `packages/kit/src/testing/boot.ts` — provide RateLimiter layer (parité prod)
- `packages/kit/src/graphql/builder.ts` — `@pothos/plugin-directives` + déclaration `rateLimit`
- `packages/modules/auth/src/http/credential.ts` — `consume` ×2 (IP + email) sur sign-in & sign-up + 429
- `packages/modules/auth/src/graphql/schema/account/mutations.ts` — directive sur les 3 `request*`
- tests E2E auth (REST + GQL) + test unit kit
- catalog `pnpm-workspace.yaml` + `package.json` des packages concernés

## Risques

- **Deux stores non partagés** — un client peut consommer la limite REST et la
  limite GQL indépendamment. Acceptable : surfaces distinctes, vecteurs distincts.
- **In-memory = par-instance** — en multi-instance, le plafond effectif est
  `limit × N_instances`. Mitigé en défense-en-profondeur ; swap Redis documenté
  pour quand le multi-instance arrive.
- **IP derrière proxy** — `xForwardedFor` doit être fiable (proxy de confiance).
  Si un proxy non-fiable, l'IP est spoofable ; documenter l'hypothèse "trusted proxy".
