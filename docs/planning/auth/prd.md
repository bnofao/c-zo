# PRD: Module Auth

**Status**: Draft
**Author**: Claude (Briana)
**Created**: 2026-02-03
**Last Updated**: 2026-02-03
**Brainstorm**: [brainstorm.md](./brainstorm.md)

---

## 1. Overview

Le module Auth fournit un système complet d'authentification et d'autorisation pour la plateforme c-zo. Il supporte plusieurs types d'acteurs (customers, merchants, admins, API consumers) tout en restant domain-agnostic. Basé sur **better-auth**, il expose des endpoints REST pour l'authentification et protège entièrement l'endpoint GraphQL.

## 2. Problem Statement

### Current State
- Développement greenfield - aucun système d'auth en place
- Le placeholder du module existe à `packages/modules/auth/` mais est vide
- Les modules product et attribute progressent sans contexte utilisateur

### Target State
- Système d'authentification unifié pour tous les acteurs
- Table users unique avec différenciation par rôles
- Organisations génériques supportant le multi-tenant
- REST pour auth, GraphQL protégé par session
- Restrictions d'authentification configurables par type d'acteur

### Impact
- **Customers**: Inscription et connexion simples et sécurisées
- **Merchants**: Gestion d'équipe avec contrôle d'accès basé sur l'organisation
- **Admins**: Accès plateforme pour support et gestion
- **API Consumers**: Accès programmatique pour intégrations headless
- **Développeurs**: Contrats clairs pour intégrer l'auth avec les modules de domaine

## 3. Goals

### Primary Goals
- [ ] Authentifier les 4 types d'acteurs via méthodes appropriées
- [ ] Fournir des primitives domain-agnostic (users, sessions, organizations, roles)
- [ ] Protéger l'endpoint GraphQL (requiert session valide)
- [ ] Supporter le multi-tenant via organisations génériques
- [ ] Permettre aux modules de domaine de configurer les restrictions d'auth

### Non-Goals (Out of Scope)
- Définitions de rôles spécifiques au domaine (customer/merchant/admin = modules de domaine)
- Application des permissions (modules de domaine appliquent leurs propres règles)
- Profils utilisateurs étendus (modules de domaine étendent via leurs tables)
- Gating paiement/abonnement (module billing séparé)
- Multi-région/résidence des données (infrastructure)
- Magic link, Passkey/WebAuthn, SSO/SAML (v1.1+)

## 4. Success Metrics

| Metric | Target | Measurement Method | Timeline |
|--------|--------|-------------------|----------|
| Temps de connexion | < 200ms | APM monitoring | MVP |
| Validation session | < 50ms | APM monitoring | MVP |
| Couverture de tests | 80%+ | Jest coverage report | MVP |
| Checklist OWASP Auth | 100% | Security audit | MVP |
| Adoption API keys | 10+ intégrations | API analytics | 3 mois post-launch |

## 5. Features and Requirements

### Must-Have Features (P0)

#### Feature 1: Authentification Email/Password
- **Description:** Inscription et connexion par email/mot de passe avec vérification email
- **User Story:** As a customer, I want to register with my email so that I can create an account securely
- **Acceptance Criteria:**
  - [ ] Inscription avec email, mot de passe, nom
  - [ ] Vérification email obligatoire avant première connexion
  - [ ] Connexion avec email/mot de passe
  - [ ] Flux de réinitialisation de mot de passe
  - [ ] Validation de force du mot de passe (min 8 chars, complexity)
- **Dependencies:** Novu pour emails transactionnels

#### Feature 2: Connexion Sociale OAuth
- **Description:** Authentification via providers OAuth selon le type d'acteur
- **User Story:** As a customer, I want to login with Google so that I don't need to remember another password
- **Acceptance Criteria:**
  - [ ] Customer/Merchant: Google OAuth
  - [ ] Admin: GitHub OAuth (corporate SSO)
  - [ ] OAuth state contient le type d'acteur pour callbacks sécurisés
  - [ ] Liaison compte existant si même email
- **Dependencies:** Google OAuth, GitHub OAuth

#### Feature 3: Gestion des Sessions
- **Description:** Sessions avec contexte acteur stockées dans Redis
- **User Story:** As a user, I want to see my active sessions so that I can manage my security
- **Acceptance Criteria:**
  - [ ] Session porte `actorType`, `authMethod`, `organizationId`
  - [ ] Lister les sessions actives (appareils)
  - [ ] Révoquer une session spécifique
  - [ ] Révoquer toutes les autres sessions
  - [ ] Déconnexion (session unique ou toutes)
- **Dependencies:** Redis pour stockage sessions

#### Feature 4: Endpoints REST par Acteur
- **Description:** Structure `/api/auth/[actor]/<action>` pour validation précoce
- **User Story:** As a developer, I want clear auth endpoints per actor type so that validation happens before authentication
- **Acceptance Criteria:**
  - [ ] `/api/auth/customer/*` - endpoints customer
  - [ ] `/api/auth/admin/*` - endpoints admin
  - [ ] `/api/auth/merchant/*` - endpoints merchant
  - [ ] Validation des restrictions AVANT l'authentification
  - [ ] `/api/auth/switch-actor` pour multi-rôles
  - [ ] `/api/auth/session` pour session courante
- **Dependencies:** better-auth

#### Feature 5: Protection Endpoint GraphQL
- **Description:** L'endpoint GraphQL requiert une session valide
- **User Story:** As a security engineer, I want GraphQL protected so that unauthenticated users can't access business data
- **Acceptance Criteria:**
  - [ ] Middleware rejette requêtes sans session valide
  - [ ] Contexte GraphQL inclut session, user, actorType, organization
  - [ ] Introspection désactivée en production
  - [ ] Introspection autorisée en dev uniquement
- **Dependencies:** graphql-yoga middleware

#### Feature 6: Organisations et Membres
- **Description:** Multi-tenant via organisations génériques avec invitations
- **User Story:** As a merchant, I want to invite team members so that they can help manage my store
- **Acceptance Criteria:**
  - [ ] CRUD Organisation (créer, lire, mettre à jour, supprimer)
  - [ ] Système d'invitation par email avec expiration
  - [ ] Gestion des membres (ajouter, supprimer, modifier rôle)
  - [ ] Rôles génériques (owner, admin, member, viewer)
  - [ ] Changement d'organisation active
- **Dependencies:** better-auth plugin organization, Novu pour invitations

#### Feature 7: Two-Factor Authentication (2FA)
- **Description:** TOTP 2FA avec codes de secours
- **User Story:** As an admin, I want 2FA required so that my account is protected even if password is compromised
- **Acceptance Criteria:**
  - [ ] Configuration TOTP (QR code + manual entry)
  - [ ] Vérification code TOTP à la connexion
  - [ ] Génération de codes de secours (10 codes)
  - [ ] Désactivation 2FA (avec re-authentification)
  - [ ] 2FA obligatoire configurable par type d'acteur
- **Dependencies:** better-auth plugin two-factor

#### Feature 8: Clés API
- **Description:** Accès programmatique pour intégrations headless
- **User Story:** As an API consumer, I want API keys so that I can integrate with c-zo programmatically
- **Acceptance Criteria:**
  - [ ] Génération de clés API avec nom et expiration optionnelle
  - [ ] Scoping par organisation
  - [ ] Révocation de clés
  - [ ] Validation Bearer token dans middleware
  - [ ] Préfixe identifiable (`czo_`) pour détection de fuites
- **Dependencies:** better-auth plugin api-key

#### Feature 9: AuthRestrictionRegistry
- **Description:** Service permettant aux modules de domaine de configurer les restrictions d'auth par acteur
- **User Story:** As a domain module developer, I want to register auth restrictions so that my actor type has appropriate security
- **Acceptance Criteria:**
  - [ ] API `registerActorType(actorType, config)` pour modules de domaine
  - [ ] Config: `allowedMethods`, `priority`, `require2FA`, `sessionDuration`, `allowImpersonation`
  - [ ] Interface `ActorTypeProvider` pour déterminer types d'acteurs d'un user
  - [ ] Résolution par priorité pour paramètres globaux (plus élevé = plus restrictif)
  - [ ] Registry frozen après boot des modules
  - [ ] Config par défaut sécurisée (email-password uniquement)
- **Dependencies:** @czo/kit IoC container

#### Feature 10: Capacités Admin
- **Description:** Outils pour le support et la gestion plateforme
- **User Story:** As a support agent, I want to impersonate users so that I can debug their issues
- **Acceptance Criteria:**
  - [ ] Impersonation utilisateur (avec session spéciale)
  - [ ] Fin d'impersonation (retour session admin)
  - [ ] Lister/rechercher utilisateurs
  - [ ] Lister/rechercher organisations
  - [ ] Audit trail des actions admin
- **Dependencies:** better-auth plugin admin

### Should-Have Features (P1)

#### Feature 11: Rate Limiting
- **Description:** Protection contre les attaques brute-force
- **User Story:** As a security engineer, I want rate limiting so that brute-force attacks are mitigated
- **Acceptance Criteria:**
  - [ ] Login: 5 tentatives / 15 min par IP/email
  - [ ] Registration: 3 inscriptions / heure par IP
  - [ ] Password reset: 3 demandes / heure par email
  - [ ] API keys: 100 requêtes / minute par clé
  - [ ] Blocage temporaire après dépassement
- **Dependencies:** Redis pour compteurs

### Nice-to-Have Features (P2)

#### Feature 12: Notifications de Sécurité
- **Description:** Alertes pour événements de sécurité
- **User Story:** As a user, I want security alerts so that I know if my account is compromised
- **Acceptance Criteria:**
  - [ ] Alerte nouveau device/localisation
  - [ ] Notification 2FA activé/désactivé
  - [ ] Alerte tentatives de connexion échouées
- **Dependencies:** Novu

## 6. User Experience

### User Flows

#### Customer Registration Flow
```
1. GET /signup/customer → Page inscription customer
2. Saisie email, password, name
3. POST /api/auth/customer/sign-up
4. Email de vérification envoyé
5. Click lien → GET /api/auth/customer/verify-email?token=...
6. Redirection → /login/customer
7. POST /api/auth/customer/sign-in/email
8. Session créée (actorType: 'customer')
9. Redirection → /shop
```

#### Admin Login Flow (2FA)
```
1. GET /login/admin → Page login admin
2. Saisie email, password
3. POST /api/auth/admin/sign-in/email
4. Si 2FA activé → Response: { requires2FA: true }
5. Affichage formulaire TOTP
6. POST /api/auth/two-factor/verify
7. Session créée (actorType: 'admin')
8. Redirection → /admin/dashboard
```

#### Multi-Role Context Switch
```
1. User connecté en tant que customer
2. User a aussi le rôle admin
3. Click "Switch to Admin"
4. POST /api/auth/switch-actor { actorType: 'admin' }
5. Si méthode auth compatible → nouvelle session admin
6. Sinon → Erreur REAUTH_REQUIRED + loginUrl admin
```

### Wireframes/Mockups
- Pages de login séparées par acteur (`/login/customer`, `/login/admin`, `/login/merchant`)
- Configuration statique côté frontend des méthodes disponibles par acteur
- Pas de lookup email côté serveur (évite énumération utilisateur)

## 7. Technical Constraints

- **Performance Requirements:**
  - Connexion < 200ms
  - Validation session < 50ms
- **Scalability:**
  - Sessions Redis pour scalabilité horizontale
  - Stateless authentication pour API consumers
- **Browser/Platform Support:**
  - Tous navigateurs modernes (Chrome, Firefox, Safari, Edge)
  - Applications mobiles via API
- **Integrations:**
  - better-auth (core auth)
  - Redis (sessions)
  - Novu (emails/notifications)
  - Google OAuth, GitHub OAuth

## 8. Security & Compliance

- **Authentication:**
  - Email/password avec vérification email
  - OAuth (Google, GitHub selon acteur)
  - TOTP 2FA
  - API keys avec préfixe détectable
- **Authorization:**
  - Session avec contexte acteur (`actorType`)
  - Validation méthode d'auth par acteur
  - Endpoint GraphQL protégé
- **Data Privacy:**
  - Passwords hashés (bcrypt/argon2)
  - Sessions stockées dans Redis (pas en DB)
  - Tokens de vérification à usage unique
- **Compliance:**
  - OWASP Authentication Cheatsheet
  - Rate limiting agressif sur endpoints auth
  - Pas d'énumération utilisateur

## 9. Dependencies

**TRD:** [trd.md](./trd.md) (à créer)

### Blockers
- @czo/kit module system opérationnel
- PostgreSQL database setup
- Redis pour sessions

### Related Features
- Module Product (contexte utilisateur pour reviews, wishlist)
- Module Attribute (consumer pattern similaire)
- Module Customer (profils étendus)
- Module Merchant (gestion boutique)

## 10. Timeline & Milestones

| Milestone | Description | Target Date | Status |
|-----------|-------------|-------------|--------|
| Phase 1 | Setup better-auth + email/password | TBD | Pending |
| Phase 2 | OAuth + Sessions Redis | TBD | Pending |
| Phase 3 | Organizations + 2FA | TBD | Pending |
| Phase 4 | API Keys + Admin | TBD | Pending |
| Phase 5 | AuthRestrictionRegistry | TBD | Pending |
| Launch | Production ready | TBD | Pending |

---

## Appendix

### Open Questions
- [x] Table users unique ou séparée par acteur? → **Table unique avec rôles**
- [x] Rôles spécifiques au domaine ou génériques? → **Génériques**
- [x] Quels plugins better-auth? → **organization, two-factor, api-key, admin**
- [x] Providers sociaux MVP? → **Google (customer/merchant) + GitHub (admin)**
- [x] Stockage session? → **Redis**
- [x] Service email? → **Novu**

### References
- [Brainstorm Auth](./brainstorm.md)
- [Documentation better-auth](https://www.better-auth.com/)
- [OWASP Authentication Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Module Attribute c-zo](../attribute/brainstorm.md) - Pattern de référence

### Stakeholders & Approvals
| Name | Role | Date | Signature |
|------|------|------|-----------|
| Claude (Briana) | Author | 2026-02-03 | Draft |
| User | Product Owner | TBD | Pending |
