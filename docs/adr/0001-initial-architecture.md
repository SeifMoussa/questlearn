# ADR 0001: Initial Architecture

## Status

Accepted

## Context

QuestLearn needs a foundation that can carry ten more modules (auth
through hardening) without a rewrite, while staying small enough for one
person to build and demo credibly. The stack and repository shape were
locked before any code was written (see the master spec, §11) so that
later modules build on stable ground instead of re-litigating tooling
choices module by module.

## Decision

- **pnpm workspace monorepo**, no Nx/Turborepo/Lerna. `apps/*` holds
  deployable applications, `packages/*` holds shared, publishable-shaped
  code (starting with `@questlearn/config`). A plain workspace is enough
  at this size; an orchestrator is worth adopting later only if build
  time or caching becomes a real, measured problem.
- **NestJS** for the API. Its module/provider/guard system maps directly
  onto the domain boundaries in the spec (auth, classes, questions,
  activities, attempts, scoring, mastery, gamification, quests, reports,
  notifications, audit) and gives dependency injection for the
  request-scoped tenancy and authorization checks those modules will
  need.
- **Next.js (App Router)** for the frontend. Server and client components
  in one framework, without a separate API-gateway layer just to serve
  HTML.
- **PostgreSQL** as the single source of truth. Relational integrity
  matters here — mastery, XP, and quest state all derive from attempt
  data, and the spec requires `tenant_id` on every row for correctness,
  which fits a relational schema better than a document store.
- **Redis** for session/cache concerns now, and reserved for BullMQ
  background jobs and Phase 2 socket pub/sub later, so it's introduced
  once, in Module 0, rather than bolted on mid-project.
- **Docker Compose** for local Postgres and Redis, so nothing needs to be
  installed system-wide and the same service definitions describe what
  CI and, eventually, deployment expect.
- **Jest only** for unit/integration tests (no Vitest — one test runner
  is enough at this size and avoids maintaining two mocking/coverage
  setups for no real benefit). Playwright is reserved for browser
  journeys starting Module 1, once there's an actual user flow to drive.

## Consequences

- Module 0 ships no feature/business logic — only the shell, a real
  health check, and the tooling every later module depends on
  (workspace, env validation, CI, Docker Compose, Jest).
- Because the API validates its environment at startup via
  `@questlearn/config`, a missing or malformed `DATABASE_URL` (for
  example) fails the process immediately with a readable error instead
  of surfacing later as a confusing connection timeout.
- CI runs lint, typecheck, unit tests, and build on every push, but does
  not yet spin up Postgres/Redis service containers — the health check
  test mocks both clients, so there is nothing that requires live infra
  in CI yet. Real integration testing against live services starts in
  Module 1 alongside the first database migrations.
