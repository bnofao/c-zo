<!--
=============================================================================
SYNC IMPACT REPORT
=============================================================================
Version Change: [INITIAL] → 1.0.0
Modified Principles: N/A (initial constitution)
Added Sections:
  - Core Principles (8 principles)
    I. Code Quality & Maintainability
    II. Testing Standards (NON-NEGOTIABLE)
    III. API-First Architecture
    IV. Modular Design
    V. UX Consistency
    VI. Performance Requirements
    VII. Security & Data Protection
    VIII. Observability & Monitoring
  - Technical Standards
  - Governance
  
Removed Sections: N/A

Templates Requiring Updates:
  ✅ plan-template.md - UPDATED with detailed constitution check gates
  ✅ tasks-template.md - test-first workflow present, already aligned
  ✅ spec-template.md - UPDATED with API contracts, performance, security, and accessibility sections

Follow-up TODOs:
  - Establish baseline metrics for performance requirements (Principle VI)
  - Define specific security audit schedule (Principle VII)
  - Configure monitoring infrastructure for observability (Principle VIII)
  - Document design tokens and UI component library standards (Principle V)
=============================================================================
-->

# c-zo Marketplace Constitution

## Core Principles

### I. Code Quality & Maintainability

**Rule**: Every code contribution MUST meet the following quality standards:
- TypeScript strict mode enabled across all packages
- ESLint rules pass without warnings
- Code follows established patterns in the monorepo
- Functions and classes have clear, single responsibilities (SRP)
- No code duplication across packages (DRY) - shared logic belongs in packages/
- Public APIs are documented with TSDoc comments
- Complex logic includes inline explanatory comments

**Rationale**: In a monorepo with multiple apps and shared packages, consistency and maintainability are critical. Code quality standards prevent technical debt accumulation and ensure packages remain reusable across applications.

### II. Testing Standards (NON-NEGOTIABLE)

**Rule**: Test-Driven Development (TDD) is mandatory for all new features and APIs:
- Tests MUST be written before implementation
- Tests MUST fail initially (Red phase)
- Implementation proceeds only after test failure is verified (Green phase)
- Refactoring follows working tests (Refactor phase)
- Minimum coverage requirements:
  - Unit tests: Core business logic and utilities
  - Integration tests: API endpoints and service interactions
  - Contract tests: All package public APIs
  - E2E tests: Critical user journeys (at least one per app)
- Tests are co-located with source code or in dedicated test directories
- Mock external dependencies; integration tests use test containers when needed

**Rationale**: TDD ensures APIs are designed from the consumer's perspective, catches regressions early, and provides living documentation. In a marketplace platform with multiple interdependent services, comprehensive testing is non-negotiable for reliability.

### III. API-First Architecture

**Rule**: All functionality MUST be exposed through well-defined APIs:
- GraphQL as primary API protocol (evidence: graphql-codegen in dependencies)
- RESTful endpoints for simple operations or external integrations
- APIs designed before implementation (contract-first)
- All endpoints have:
  - Typed request/response schemas
  - Error handling with standard error codes
  - Rate limiting configuration
  - Authentication/authorization rules
  - Versioning strategy (URL or header-based)
- Breaking changes require MAJOR version bump
- Backward compatibility maintained for at least 2 versions

**Rationale**: API-first design enables marketplace modularity, allows apps to evolve independently, and supports third-party integrations. GraphQL provides flexibility for frontend clients while maintaining strong typing.

### IV. Modular Design

**Rule**: Code MUST be organized as independent, reusable packages:
- Each package has a single, clear purpose
- Packages expose public APIs through index files
- Inter-package dependencies are explicit in package.json
- Circular dependencies between packages are forbidden
- Apps consume packages but never export to packages
- Shared UI components belong in packages/ui
- Business logic belongs in packages/modules
- Configuration belongs in packages/[domain]-config
- Build outputs are independently deployable

**Rationale**: Modular architecture enables independent development, testing, and deployment. Clear boundaries prevent coupling and allow teams to work in parallel on different parts of the marketplace.

### V. UX Consistency

**Rule**: User experience MUST be consistent across all marketplace applications:
- All apps use the shared UI component library (packages/ui)
- Design tokens (colors, spacing, typography) are centralized
- Consistent interaction patterns:
  - Loading states (spinners, skeletons)
  - Error states (user-friendly messages, retry options)
  - Empty states (helpful guidance, call-to-action)
  - Form validations (real-time feedback, clear error messages)
- Accessibility standards (WCAG 2.1 Level AA minimum):
  - Keyboard navigation support
  - Screen reader compatibility
  - Sufficient color contrast
  - Focus indicators
- Responsive design: mobile-first approach
- Performance perception:
  - Optimistic UI updates where safe
  - Immediate feedback on user actions
  - Skeleton loading for content

**Rationale**: Marketplace users interact with multiple apps. Consistent UX builds trust, reduces cognitive load, and creates a cohesive brand experience. Accessibility ensures the platform serves all users.

### VI. Performance Requirements

**Rule**: All applications and APIs MUST meet these performance standards:
- API response times:
  - P50 < 100ms (typical queries)
  - P95 < 300ms (complex queries)
  - P99 < 1000ms (maximum acceptable)
- Frontend performance:
  - First Contentful Paint (FCP) < 1.5s
  - Time to Interactive (TTI) < 3.5s
  - Largest Contentful Paint (LCP) < 2.5s
  - Cumulative Layout Shift (CLS) < 0.1
- Bundle size:
  - Initial JavaScript load < 200KB (gzipped)
  - Code splitting for routes > 50KB
  - Lazy loading for non-critical features
- Database queries:
  - Indexed queries only in production
  - N+1 queries forbidden (use DataLoader or batch queries)
  - Query time < 50ms P95
- Scalability:
  - Horizontal scaling must be possible (stateless services)
  - Cache strategies for frequently accessed data
  - Connection pooling for database access

**Rationale**: Performance directly impacts user satisfaction, conversion rates, and operational costs. Marketplace applications handle multiple concurrent users; performance degradation affects revenue and reputation.

### VII. Security & Data Protection

**Rule**: Security and privacy MUST be built into every layer:
- Authentication:
  - JWT-based authentication for API access
  - Refresh token rotation
  - Multi-factor authentication for sensitive operations
- Authorization:
  - Role-based access control (RBAC)
  - Principle of least privilege
  - Resource-level permissions
- Data protection:
  - Encryption at rest for sensitive data
  - TLS 1.3 for data in transit
  - Personal data handling complies with GDPR/CCPA
  - Audit logs for sensitive operations
- Input validation:
  - Server-side validation for all inputs
  - Sanitization to prevent injection attacks
  - Rate limiting to prevent abuse
- Dependencies:
  - Regular security audits (pnpm audit)
  - Automated vulnerability scanning
  - Dependencies updated within 30 days of security patches
- Secrets management:
  - No secrets in code or version control
  - Environment variables for configuration
  - Secret rotation procedures documented

**Rationale**: Marketplace platforms handle user data, payments, and business transactions. Security breaches damage trust irreparably. Proactive security measures are essential for platform viability.

### VIII. Observability & Monitoring

**Rule**: All services MUST be observable and monitored:
- Structured logging:
  - JSON format for machine parsing
  - Context-rich logs (request ID, user ID, trace ID)
  - Log levels: ERROR (requires action), WARN (potential issue), INFO (business events), DEBUG (troubleshooting)
- Metrics:
  - RED metrics (Rate, Errors, Duration) for all APIs
  - Business metrics (orders, registrations, transactions)
  - Infrastructure metrics (CPU, memory, disk, network)
- Distributed tracing:
  - End-to-end request tracing across services
  - Performance bottleneck identification
- Alerting:
  - Alerts for SLA violations
  - On-call escalation procedures
  - Runbooks for common issues
- Health checks:
  - Liveness and readiness endpoints
  - Dependency health verification

**Rationale**: In a distributed marketplace system, observability is critical for debugging, performance optimization, and maintaining SLAs. Without visibility, issues cascade before detection.

## Technical Standards

### Monorepo Management
- Turbo for build orchestration and caching
- pnpm workspaces for dependency management
- Conventional commits for changelog generation
- Changesets for versioning and publishing

### Code Style & Tooling
- ESLint (@antfu/eslint-config) enforced in CI
- Prettier formatting with lint-staged pre-commit hooks
- TypeScript strict mode in all tsconfig.json files
- Vitest for unit and integration testing

### Development Workflow
1. Feature branch from main
2. Write tests (TDD - Red phase)
3. Implement to pass tests (Green phase)
4. Refactor for quality (Refactor phase)
5. Lint and format pass locally
6. PR with description linking to specification
7. CI checks pass (lint, test, build)
8. Code review approval required
9. Squash merge to main

### Package Publishing
- Semantic versioning (MAJOR.MINOR.PATCH)
- CHANGELOG.md updated via conventional commits
- Breaking changes documented in migration guides
- Packages published to internal registry or npm

## Governance

### Amendment Process
1. Proposed changes documented with rationale
2. Team review and discussion (async or sync)
3. Approval requires consensus (or defined voting mechanism)
4. Update constitution with version bump:
   - MAJOR: Principle removal or fundamental change
   - MINOR: New principle or section added
   - PATCH: Clarifications or wording improvements
5. Update dependent templates and documentation
6. Communicate changes to all team members

### Compliance & Review
- All PRs reviewed against constitution principles
- Complexity must be justified when violating simplicity
- Quarterly constitution review to assess relevance
- Annual deep dive to adapt to evolved needs

### Technical Decision Authority
- Architecture decisions: Team consensus or tech lead
- Implementation details: Developer discretion within principles
- Breaking changes: Require cross-team review
- Security concerns: Immediate escalation, override other priorities

### Conflict Resolution
When principles conflict (e.g., performance vs. maintainability):
1. Document the tradeoff explicitly
2. Choose based on:
   - User impact (highest priority)
   - Business value
   - Long-term maintainability
   - Technical debt implications
3. Record decision in ADR (Architecture Decision Record)
4. Set review date to reassess

### Living Document
This constitution is a living document. It should evolve as the marketplace grows, technologies change, and team insights accumulate. Regular review ensures it remains a useful guide rather than an ignored mandate.

**Version**: 1.0.0 | **Ratified**: 2025-10-27 | **Last Amended**: 2025-10-27
