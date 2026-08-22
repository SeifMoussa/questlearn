# QuestLearn — Master Requirements & Engineering Plan
### (Consolidated: requirements doc + repository/checkpoint policy — this file supersedes both)

**Repository:** `github.com/SeifHegazy53/questlearn`
**Status:** Requirements and engineering policy locked. Ready for Module 0.

---

## PART A — Product Requirements

### 1. Project Summary

QuestLearn is a web application where a teacher creates a class, builds a
quiz from a question bank, and assigns it to learners. Learners join with
a class code, complete the quiz, and receive an automatically graded
result. Every graded attempt updates the learner's XP, level, badges, and
per-concept mastery — server-side, idempotently, exactly once per attempt.

It solves a real, narrow problem: turning a teacher's existing quiz
content into something learners are more motivated to complete, while
keeping "engagement" (XP, badges) strictly separate from "learning
evidence" (grades, mastery).

### 2. Target Role Relevance

- **Software Engineer / Full-Stack** — multi-module backend, typed API contract, relational schema design, frontend state management.
- **Secure Software Development** — auth, tenant isolation, idempotency, authorization guards, audit logging.
- **Scalable System Design** — event-driven scoring→XP→mastery pipeline, queue-based background jobs, module boundaries that scale toward Phase 2 without a rewrite.
- **Agile / SDLC** — this document, the checkpoint policy, PR-based git workflow, and Definition of Done model real planning discipline, not just delivered code.

### 3. Problem Statement

Teachers currently create quizzes with no reliable way to (a) motivate
completion or (b) see *which specific concept* a learner is struggling
with, as opposed to just a percentage score. QuestLearn builds the link
**grade → mastery → reward**, done correctly (no duplicate XP, no leaking
correct answers early, no cross-tenant data leaks) rather than done big.

### 4. Project Scope

**In scope (this repo, MVP — Modules 0–10):**
Auth, multi-tenant workspace model, classes, question bank, activities
(quizzes), assignments and attempts, scoring, concept mastery, XP/levels/
badges, linear quests, reporting, and a hardening pass (security,
accessibility, production readiness).

**In scope, Phase 2 (same repo, built only after the MVP pilot checkpoint passes — Module 11):**
Live/synchronous quiz sessions (WebSockets, session PINs, reconnection,
real-time scoring, host controls, Redis pub/sub for socket scaling).
The database and module boundaries are designed to be live-session-ready
(see §10 Architecture) but **no live-session tables, gateways, or APIs are
built until Phase 2.** Building this before the async core is stable would
introduce a separate complexity class (stateful rooms, reconnection,
duplicate real-time submissions, shared-screen privacy, horizontal socket
scaling) that would delay the stronger, more coherent portfolio story:
a complete mastery-first async learning platform.

**Out of scope entirely (would need a separate repository/project):**
Institution admin, multi-teacher tenancy, licensing/billing, age-adaptive
experience profiles, guardian accounts, under-13 support, content
marketplace, social/messaging features, AI-generated grading, LMS
integrations, native mobile apps, moderation queue, legal/policy
documents, full observability stack (APM/alerting).

**Assumptions:**
- **A1** — Primary customer: independent teacher/tutor, not an institution.
- **A2** — Learners are 13+, no guardian/consent flow needed.
- **A3** — Formative assessment only — scores are not official grades.
- **A4** — One active tenant type: "teacher workspace." Every row still carries `tenant_id` so the architecture is multi-tenant-correct even though institution admin UI isn't built.
- **A5** — Mastery formula simplified to `mastery = weighted_avg(response_score, recency_weight)` for v1 (recency + hint-penalty only); full independence/repetition weighting is a documented v2 refinement. State is additionally gated by a minimum evidence-row-count and minimum-distinct-attempt-count per state (Module 10.2), so Proficient/Mastered require corroborating evidence from multiple distinct submitted assignments, not just a high score from one sitting — this heuristic caps a state downward from what the score alone would justify, never promotes it upward, and is a transparent, deterministic product heuristic, not a validated Bayesian Knowledge Tracing or IRT model.
- **A6** — No real payments; a `plan: free` field exists in the data model but no billing flow is built.
- **A7** — Single language (English), UI strings externalized for future localization, not implemented now.

### 5. User Stories

**Teacher** — register/verify/login → create class → build quiz from question bank, tag concepts → assign with deadline → override a score with a reason → view class report (completion, average score, per-concept mastery) → award a manual badge.

**Learner** — join class with code → start quiz (autosaved) → submit → see XP/level/badges → see mastery per concept and what to practice next → cannot see another learner's grades or mastery.

### 6. Functional Requirements

1. Auth: register/verify/login/reset, argon2 hashing, JWT access+refresh with expiry.
2. Class CRUD, join-code generation with expiry/rotation, roster add/remove.
3. Question CRUD with versioning — editing a used question creates a new version; attempts reference the exact version shown.
4. Activity CRUD: draft → preview → publish (immutable) → assign.
5. Attempt lifecycle: start → autosave → submit (locked, idempotent — duplicate submit must not double-grade or double-reward).
6. Scoring service: rule-based per question type; partial credit = `correct/total_correct − incorrect/total_incorrect`, floor 0, ceiling 1.
7. Mastery service: recalculates live on every read (never cached) from evidence recorded at grading time; states Beginning/Developing/Proficient/Mastered with configurable score thresholds (0.00/0.40/0.70/0.90), each state additionally gated by a minimum evidence-row-count and minimum-distinct-attempt-count (Beginning 1/1, Developing 2/1, Proficient 3/2, Mastered 4/3) — the gate only caps a state downward from what the raw score alone would justify, it never promotes one upward. Recency weighting means newer evidence has proportionally greater influence when combined with older evidence, not that scores "decay" — a static evidence set's score is provably invariant over time.
8. Gamification service: append-only XP ledger, level curve, badge rules — idempotent against the attempt's event ID.
9. Quest service: linear step progression, gated by completion and/or mastery threshold, single reward issuance.
10. Reporting: completion rate, average score, mastery breakdown, question-level analysis, CSV export.
11. Notification records: in-app only, read/unread state.
12. Audit log: every grade override, manual XP/badge change, and permission change — actor, reason, timestamp.

### 7. Non-Functional Requirements

Reliability (idempotent submission/reward under retry, tested not assumed) · Usability (loading/empty/error/permission-denied states on every screen) · Maintainability (modular backend, explicit service boundaries, typed API contract) · Documented performance limitations (no production-scale load testing in MVP) · Architectural scalability (tenant ID on every row, event-driven pipeline ready for Phase 2 without a rewrite).

### 8. Security Requirements

Argon2id password hashing · generic "invalid credentials" errors (no account-existence leakage) · short-lived JWTs with refresh, revocable sessions · server-side authorization on every request, tested for cross-tenant access and IDOR · correct answers never sent to client before permitted · rate-limited/expirable/rotatable join codes, brute-force tested · schema validation on all writes (class-validator) · secrets via env vars only, `.env` gitignored from commit 1 · structured security logging (auth events, permission denials, audited actions) with no plaintext secrets or answer content in logs.

### 9. Ethical and Safety Constraints

No real-money transactions, no student-data resale, no advertising. Rewards are explicitly cosmetic/motivational, never conflated with grades in UI, API shape, or database structure. No dark-pattern gamification. Fictional seed data only — no real student data required to run or demo the project.

### 10. Architecture Plan

```
Client (Next.js/React)
   │  REST (typed via OpenAPI)
   ▼
API (NestJS modular monolith)
   auth → tenancy context → authorization guard → feature module
   Modules: auth, tenancy, classes, questions, activities, attempts,
   scoring, concepts, mastery, gamification, quests, reports,
   notifications, audit
   │
   ├─ PostgreSQL (source of truth, tenant_id on every row)
   ├─ Redis (session cache, rate limiting; pub/sub reserved for Phase 2 sockets)
   └─ Background worker (BullMQ) → mastery recalculation, badge rules,
      notification dispatch
```

**Submission pipeline** (the correctness-critical flow, tested explicitly):
`Attempt submitted → idempotency check → attempt locked → responses graded
→ score computed → AttemptGraded event → mastery evidence recorded →
mastery recalculated → XP transaction created → badge rules evaluated →
quest progress evaluated → notification queued → response returned.`
Every step after "idempotency check" must be safe to re-run without
double effects.

---

## PART B — Repository & Engineering Policy

### 11. Final Locked Decisions

```
Repository name:            questlearn
Repository owner:           github.com/SeifHegazy53
Architecture:                pnpm workspace modular monorepo
Monorepo orchestrator:       none initially (plain pnpm workspaces)
Package manager:              pnpm 11.20.0
Node version:                Node.js 24 LTS
Backend framework:           NestJS
Frontend framework:          Next.js
Unit/integration testing:    Jest
Browser testing:             Playwright
Database:                    PostgreSQL
Cache/session infra:         Redis
Local infrastructure:        Docker Compose
License:                     MIT
Initial visibility:          private
Public checkpoint:           after Module 1 (auth) passes
CI introduction:             Module 0
Frontend strategy:           thin UI in every module (no backend-only phase)
Screenshot strategy:         browser checkpoint in every module
```

### 12. Module Roadmap (final)

```
Module 0  — Foundation
Module 1  — Authentication
Module 2  — Classes
Module 3  — Questions
Module 4  — Activities
Module 5  — Assignments and Attempts
Module 6  — Mastery
Module 7  — Gamification
Module 8  — Quests
Module 9  — Reporting and Administration
Module 10 — Security, Accessibility, and Production Hardening

Phase 2:
Module 11 — Live Sessions (only after the MVP pilot checkpoint passes)
```

### 13. Screenshot-First Vertical Development

Every module (0–10) delivers a **thin vertical slice**, not backend-then-frontend:
1. Database changes 2. Backend domain logic 3. API endpoints 4. Minimal
Next.js interface 5. Seed/fixture data 6. Automated tests 7. A
reproducible demonstration flow 8. At least one meaningful screenshot
9. README checkpoint documentation.

A module is **not** done just because the API responds, unit tests pass,
or migrations succeed — it's done when its primary flow can be exercised
through the browser.

**Screenshot directory:**
```
docs/screenshots/
  00-foundation/  01-authentication/  02-classes/  03-questions/
  04-activities/  05-assignments-attempts/  06-mastery/
  07-gamification/  08-quests/  09-reporting-admin/  10-hardening/
  (11-live-sessions/ — Phase 2 only)
```
Naming: `01-login-page.png`, `02-registration-validation.png`, etc.
Rules: seeded demo accounts only, fictional data, consistent viewport,
no real emails/tokens/terminal secrets in frame.

**Playwright** introduced at Module 1: serves both as E2E test and
reproducible screenshot generator. CI-generated screenshots go to
workflow artifacts; only manually-reviewed shots get committed to
`docs/screenshots` (avoid noisy history).

### 14. Screenshot Checkpoints by Module

| Module | Required visual output |
|---|---|
| 0 — Foundation | App shell, health page, API docs shell |
| 1 — Auth | Registration, login, validation states, authenticated dashboard |
| 2 — Classes | Teacher class list, create-class form, class detail, join code |
| 3 — Questions | Question bank, create-question form, question preview |
| 4 — Activities | Activity builder, question ordering, learner preview |
| 5 — Assignments/Attempts | Assignment form, learner dashboard, activity player, result |
| 6 — Mastery | Learner concept view, teacher class-mastery view |
| 7 — Gamification | XP profile, level progress, achievements |
| 8 — Quests | Quest builder, learner quest map |
| 9 — Reporting/Admin | Teacher dashboard, question analysis, learner report |
| 10 — Hardening | (no new UI — security/a11y/perf pass on existing screens) |
| *(Phase 2) 11 — Live* | *Host lobby, learner joining, active question, results* |

Each checkpoint's README section covers: what was implemented, why it
matters, architecture decisions, test coverage, how to run it, screenshot
links, known limitations, next checkpoint.

### 15. Tooling

**Package manager — pnpm 11.20.0.** Native workspace support, deterministic lockfile, no Nx/Turborepo/Lerna needed at this size (reconsider only if build times/caching become an actual problem).
`pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]` · lockfile committed · CI installs with `pnpm install --frozen-lockfile`.

**Node — 24 LTS**, pinned in `.nvmrc`, `.node-version`, and root `package.json` `engines`. Same major version across local/Docker/CI/production. Don't move to Node 26 until it's LTS and validated against the stack.

**Testing split:**
- Jest — NestJS unit/integration tests, shared package tests, scoring/mastery/gamification-rule tests, permission tests. (No Vitest — avoids duplicate config, mocking, and coverage behavior for no real benefit at this size.)
- Playwright — full browser journeys, teacher/learner workflows, accessibility smoke tests, screenshot generation, cross-browser checks.

### 16. Repository Setup

**License — MIT.** `LICENSE` + `NOTICE.md`. README states: *"QuestLearn is an educational portfolio and open-source demonstration project licensed under the MIT License."* Third-party assets (fonts, icons, sample content) keep their own licenses — no unlicensed commercial assets committed.

**Visibility** — private through Module 0–1, public once the Module 1 auth checkpoint passes (commit history is preserved across the visibility change). Before publishing, verify: no committed `.env`, no credentials in git history, no real emails in screenshots, CI green, license present, README explains setup on a clean machine, Dependabot configured, security policy exists, demo accounts are fictional.

**Git policy** — default branch `main`; feature branches (`feature/auth-registration`, `fix/duplicate-xp-award`, `docs/module-01-checkpoint`); every module goes through branch → PR → CI → review → merge, even solo, for visible SDLC evidence. Conventional Commits (`feat(auth): add email registration endpoint`, `test(auth): cover invalid credentials`) — no vague messages like "update" or "fix stuff."

**Local infra — Docker Compose** (Postgres 17, Redis 8 with health checks) — no manually-installed local Postgres/Redis required. Root scripts: `infra:up`, `infra:down`, `infra:reset`, `infra:logs`.

**Environment variables** — `.env.example` committed with safe placeholders (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `CSRF_SECRET`, etc.); `.env` and all secret-bearing files gitignored. Startup validates required vars. Production secrets come from the deployment platform's secret manager, never the repo.

**CI (GitHub Actions, from Module 0)** — install → lint → typecheck → unit tests → integration tests → build (packages, API, web). Module 1 adds Postgres/Redis service containers, DB migrations, auth integration tests, and the first Playwright flow. Each later module adds its own integration tests + browser flow + screenshot artifact + permission tests. Before public pilot: dependency audit, container build, security scan, accessibility test, full Playwright suite, migration smoke test, production build test.

### 17. Module Completion Checklist (every PR)

```
[ ] Database migration included
[ ] API implemented
[ ] Authorization enforced
[ ] Tenant isolation tested
[ ] Thin browser interface included
[ ] Primary browser flow tested (Playwright)
[ ] Seed data available
[ ] At least one screenshot captured
[ ] Loading / empty / validation-error / permission-denied states implemented
[ ] CI passes
[ ] README checkpoint updated
[ ] Known limitations documented
```

### 18. Module 0 Deliverables

Public-quality repo structure · pnpm workspace · Node pinning · Next.js app · NestJS app · shared config package · Postgres+Redis Compose services · env validation · health endpoint · app shell · API docs shell · Jest config · GitHub Actions CI · `.env.example` · `.gitignore` · MIT license · initial README · ADR · CONTRIBUTING guide · SECURITY policy.

**Required browser output:** a page showing `QuestLearn — Web: Running / API: Connected / Database: Connected / Redis: Connected / Environment: Development`. This gives Module 0 a genuine visual checkpoint before auth begins.

### 19. Module 1 Deliverables

Pages: `/register /login /verify-email /forgot-password /reset-password /dashboard`.
States: empty form, client validation, server validation, invalid credentials, pending submission, successful registration/login, unauthenticated redirect, authenticated dashboard, logout.
Screenshots: `register-page.png`, `register-validation.png`, `login-page.png`, `login-error.png`, `authenticated-dashboard.png`.
Tests: registration unit tests, login unit tests, session integration tests, rate-limit tests, auth Playwright flow, unauthenticated-route test, duplicate-email test, invalid-password test.
**Repo may go public once this checkpoint passes.**

### 20. Definition of Done (MVP, Modules 0–10)

- Teacher can independently register, create a class, build/publish a quiz, and assign it.
- Learner can independently join, complete, and submit it.
- Score is correct, versioned, and cannot be silently altered.
- XP/badges cannot be duplicated under retry (tested, not assumed).
- Mastery updates correctly, visibly separate from grades everywhere.
- Cross-tenant access denied and covered by a passing test.
- Every module's Playwright E2E flow passes in CI.
- `SECURITY_NOTES.md` and `TESTING_REPORT.md` reflect what was actually verified.
- Repo is publishable as-is with no placeholder/TODO code paths in in-scope features.
- Live Sessions (Module 11) explicitly **not required** for MVP done — architecture is ready for it, nothing is built yet.

---

*Supersedes: `QuestLearn_Core_Requirements.md` and the standalone repository/checkpoint policy document. This is the single canonical spec for local development in Claude Code.*
