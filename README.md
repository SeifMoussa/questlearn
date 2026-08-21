# QuestLearn

QuestLearn is an educational gamification platform: a teacher builds a
quiz from a question bank and assigns it to a class, learners complete
it and get an automatically graded result, and every graded attempt
updates the learner's XP, level, badges, and per-concept mastery —
server-side, idempotently, exactly once per attempt. It's a portfolio
project built to demonstrate a full-stack, secure, multi-module system
rather than a single demo screen.

QuestLearn is an educational portfolio and open-source demonstration
project licensed under the MIT License.

The full product and engineering plan lives in
[`QuestLearn_Master_Spec.md`](./QuestLearn_Master_Spec.md).

## Status

Modules 0 through 10 are all in place: foundation, authentication,
classes, the question bank, activities, assignments and attempts,
mastery, gamification, quests, reporting, and a security/
accessibility/production-hardening pass — a teacher can build a class
end to end (questions → concepts → activities → assignments → quests)
and a learner can join, complete work, and see their XP, badges,
mastery, and quest progress, all backed by real tests and screenshots.
See each module's own section below (Module 1 — Authentication through
Module 10 — Hardening) for what it covers. Module 10 adds no new UI
per §14's checklist — it's a pass over the 9 modules' existing screens.
**The MVP (Modules 0–10) is feature-complete.** Module 11 (live
sessions) is Phase 2, only built after the pilot checkpoint per §20.

## Architecture

```
apps/web              Next.js (App Router) frontend
apps/api               NestJS backend, Prisma ORM
apps/api/prisma            schema, migrations, seed script
packages/config              shared env validation, tsconfig, ESLint/Prettier config
packages/design-system         design tokens + component library
```

See [`docs/adr/0001-initial-architecture.md`](./docs/adr/0001-initial-architecture.md)
for why this stack was chosen.

### Diagrams

Fifteen categories, generated directly from the real, final codebase
(schema, source, tests, CI config) rather than from the original
planning-stage sketch — several diagrams document real corrections
against that sketch (no background job queue was ever built, Redis is
provisioned but not yet load-bearing, there's no global tenancy
guard). Mermaid renders natively in GitHub's markdown viewer; the two
use-case diagrams are hand-crafted SVG since Mermaid has no native
use-case notation.

| # | Diagram | Shows |
|---|---|---|
| 1 | [System Architecture](./docs/diagrams/01-system-architecture.md) | Client → API → 11 feature modules → Postgres/Redis, as actually built |
| 2 | [Submission Pipeline](./docs/diagrams/02-submission-pipeline.md) | `AttemptsService.submit()`'s exact transaction, step by step |
| 3 | [State Machines](./docs/diagrams/03-state-machines.md) | Activity, Attempt (one-way, atomically claimed), and live-computed Mastery |
| 4 | [ERD](./docs/diagrams/04-erd.md) | All 22 Prisma models, `tenant_id` on every applicable table |
| 5 | [Component Diagram](./docs/diagrams/05-component-diagram.md) | Real NestJS module dependency edges, confirmed by grep |
| 6 | [Security & Auth Sequence](./docs/diagrams/06-security-auth-sequence.md) | Register, login, refresh rotation, CSRF double-submit |
| 7 | [Use Case Diagrams](./docs/diagrams/07-use-case-diagrams.md) | Teacher and Learner journeys (hand-crafted SVG, proper UML) |
| 8 | [CI/CD Pipeline](./docs/diagrams/08-cicd-pipeline.md) | The real `ci.yml` stage order |
| 9 | [Phase 1 vs. Phase 2](./docs/diagrams/09-phase1-vs-phase2.md) | Modules 0–10 (built) vs. Module 11 Live Sessions (deferred) |
| 10 | [Idempotency & Concurrency](./docs/diagrams/10-idempotency-concurrency.md) | The three real claim/dedup mechanisms, not one flattened pattern |
| 11 | [SDLC / Vertical Slice Workflow](./docs/diagrams/11-sdlc-workflow.md) | The actual plan → build → re-verify → PR → merge cycle every module followed |
| 12 | [Local Infra & Environment](./docs/diagrams/12-local-infra-environment.md) | `docker-compose.yml` + the two Module 10 production Dockerfiles |
| 13 | [Data Flow / Threat Model](./docs/diagrams/13-data-flow-threat-model.md) | Every real boundary from `SECURITY_NOTES.md` |
| 14 | [C4 Model](./docs/diagrams/14-c4-model.md) | Context and Container views |
| 15 | [DDD Context Map](./docs/diagrams/15-ddd-context-map.md) | The bounded contexts as they actually emerged |

## Setup (clean machine)

1. **Install Node 24.** Version pinned in `.nvmrc` / `.node-version`
   (currently `24.15.0`). If you use `nvm`: `nvm use`.
2. **Install pnpm 11.20.0**: `corepack enable && corepack prepare pnpm@11.20.0 --activate`
   (or `npm install -g pnpm@11.20.0`).
3. **Clone and install dependencies:**
   ```
   git clone https://github.com/SeifHegazy53/questlearn.git
   cd questlearn
   pnpm install
   ```
4. **Start local infrastructure** (Postgres 17, Redis 8 via Docker Compose):
   ```
   pnpm infra:up
   docker compose ps   # both services should report healthy
   ```
5. **Configure environment:**
   ```
   cp .env.example .env
   ```
   The example values already match the Docker Compose services, so no
   edits are required for local development. Generate real random
   values for `CSRF_SECRET` / `JWT_SECRET` before
   using this outside a local sandbox, e.g.:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
6. **Run the first migration and seed a demo account:**
   ```
   pnpm db:migrate
   pnpm db:seed
   ```
   Seeds one fictional demo teacher account — see
   [Demo login](#demo-login) below.
7. **Run the apps in development:**
   ```
   pnpm dev:api   # http://localhost:4000  (health: /health, docs: /api/docs)
   pnpm dev:web   # http://localhost:3000
   ```
8. **Run tests:**
   ```
   pnpm test
   ```
9. **(Optional) Build and run the production Docker images**, from the
   repo root (the build context, since both apps depend on workspace
   packages):
   ```
   docker build -f apps/api/Dockerfile -t questlearn-api .
   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 -t questlearn-web .
   docker run --network questlearn_default -e DATABASE_URL=... -e REDIS_URL=... -e CSRF_SECRET=... -e JWT_SECRET=... -e WEB_URL=... -p 4000:4000 questlearn-api
   docker run --network questlearn_default -p 3000:3000 questlearn-web
   ```
   `NEXT_PUBLIC_API_URL` is a build arg, not a runtime env var — it's
   inlined into the client bundle at build time, so it has to be set
   before building, not when running the container.

## System status checkpoint

`apps/web`'s `/status` page (moved off the homepage in Module 1 — see
below) calls the API's `/health` endpoint, which runs a real query
against Postgres and a real `PING` against Redis, and renders:

```
QuestLearn — Web: Running / API: Connected / Database: Connected / Redis: Connected / Environment: Development
```

The page shows a loading state while the check is in flight and a
degraded state (without crashing) if the API or a dependency is down.

Screenshot: [`docs/screenshots/00-foundation/01-system-status.png`](./docs/screenshots/00-foundation/01-system-status.png)

## Module 1 — Authentication

Teacher-only registration (registration creates a `teacher` account
plus a new tenant/workspace — a learner/teacher picker was explicitly
scoped out of this module), email-verification-gated login, and
cookie-based sessions.

**What it adds:**

- `POST /auth/register`, `/login`, `/verify-email`, `/forgot-password`,
  `/reset-password`, `/refresh`, `/logout`, and a protected `GET /auth/me`.
- Real Next.js pages: `/register`, `/login`, `/verify-email`,
  `/forgot-password`, `/reset-password`, and a thin authenticated
  `/dashboard` placeholder — all built with `@questlearn/design-system`.
- The homepage (`/`) is now a real marketing landing page (hero,
  feature cards, testimonial, pricing tiers); the Module 0 system
  status checkpoint moved to `/status`.

**Architecture decisions:**

- **Argon2id** password hashing (OWASP-recommended cost parameters),
  never a faster/weaker hash.
- **Access tokens are short-lived JWTs (15 min)** returned in the
  response body and held in memory only on the frontend (a React
  context), never `localStorage` — nothing an XSS payload can read
  survives a page reload.
- **Refresh tokens (7 days)** live in an httpOnly, Secure, SameSite=Lax
  cookie, are rotated on every use, and are stored **hashed** in the
  `sessions` table — a reused or stale refresh token is a dead end,
  and a database leak doesn't expose usable tokens.
- **Email verification and password reset tokens** are single-use,
  expire in ~1 hour, and are also stored hashed at rest.
- **CSRF**: the cookie-authenticated endpoints (`/auth/refresh`,
  `/auth/logout`) require a double-submit token, HMAC-signed with
  `CSRF_SECRET` so it can't be forged — the access-token-bearing
  endpoints don't need this, since a cross-site request can't attach
  an `Authorization` header.
- **Rate limiting** via `@nestjs/throttler` on `/auth/register`,
  `/auth/login`, `/auth/forgot-password` (default: 5 requests/60s,
  configurable via `AUTH_THROTTLE_LIMIT` / `AUTH_THROTTLE_TTL_MS`).
- **Every table carries `tenant_id`**, even though Module 1 only ever
  creates one tenant type — the schema is multi-tenant-correct from
  the start (see the master spec, §6.1).
- **Prisma 7** with the Postgres driver adapter (`@prisma/adapter-pg`)
  — schema.prisma no longer carries a connection URL; `prisma.config.ts`
  supplies it to the CLI, and `PrismaService` wires its own adapter at
  runtime.

**Test coverage:**

- Jest unit tests for `AuthService` — argon2 hashing, duplicate-email
  rejection, and the login error paths (wrong password and nonexistent
  email return the *exact same* generic message; an unverified account
  gets a distinct message).
- Jest integration tests against real Postgres (`apps/api/test/auth/`)
  — the full register → verify → login → protected route → refresh
  (rotates, invalidates the old token) → logout lifecycle, a
  tenant-isolation smoke test, and a rate-limit test proving the
  (limit + 1)th request is rejected and the endpoint recovers after
  the window.
- **Playwright**, introduced in this module: drives a real browser
  through register → verify (reading the token from the dev
  EmailService's log line) → login → dashboard → logout, plus the
  unauthenticated-redirect and form-validation states. This flow also
  produced the screenshots below.

**Demo login:**

`pnpm db:seed` creates one fictional demo teacher account for manual
testing:

- email: `demo.teacher@questlearn.dev`
- password: `DemoTeacher2026!`

**Screenshots** (`docs/screenshots/01-authentication/`):

- [`register-page.png`](./docs/screenshots/01-authentication/register-page.png)
- [`register-validation.png`](./docs/screenshots/01-authentication/register-validation.png)
- [`login-page.png`](./docs/screenshots/01-authentication/login-page.png)
- [`login-error.png`](./docs/screenshots/01-authentication/login-error.png)
- [`authenticated-dashboard.png`](./docs/screenshots/01-authentication/authenticated-dashboard.png)

## Module 2 — Classes

Teacher-side class management: a teacher creates a class, gets a
join code to share, and maintains a roster manually. There is no
learner login or self-service join flow in this module — a "roster
entry" is a lightweight record the teacher adds and removes by hand,
not a real user account. The actual "learner redeems a join code"
flow is deferred to a later module, once there's learner-facing
content (activities, assignments) for a learner session to land in.

**What it adds:**

- `POST /classes`, `GET /classes`, `GET /classes/:id`, `PATCH
  /classes/:id`, `POST /classes/:id/join-code/rotate`, `POST
  /classes/:id/roster`, `DELETE /classes/:id/roster/:rosterId`.
- Real Next.js pages: `/classes` (list), `/classes/new` (create), and
  `/classes/[id]` (detail — rename, archive, join-code rotation,
  roster add/remove) — all built directly against
  `@questlearn/design-system` components.
- A "Manage classes" link from `/dashboard`.

**Architecture decisions:**

- **Every endpoint is scoped by tenant ID *and* owning teacher ID**,
  checked together even though one-teacher-per-tenant currently makes
  the two checks equivalent — the same forward-compatible posture
  already established in the auth module, ready for multi-teacher
  tenants later without a rewrite.
- **Cross-tenant access 404s, never a distinct 403** — a class outside
  the caller's tenant/ownership returns exactly the same "not found"
  response as a class that doesn't exist at all, so the response shape
  can't be used to confirm a class id is real. The frontend mirrors
  this: there's no separate "permission denied" UI, just the same
  not-found state the API deliberately returns.
- **Classes are archived, not deleted**; roster entries are
  soft-deleted via `removedAt`, not hard-deleted — later modules
  (activities, assignments) will reference classes, and an audit trail
  matters more than a clean delete.
- **Join codes** are 8 characters, uppercase alphanumeric, excluding
  characters that are easy to misread (`0`/`O`, `1`/`I`/`L`), globally
  unique across the whole table (not just per tenant, since a future
  redemption endpoint will need to look one up by code alone with no
  tenant selector), with collision-retry generation and a default
  30-day expiry from creation or rotation. Rotating immediately
  invalidates the old code.
- **Structured security logging** extends the auth module's
  `SecurityLogger` with class-lifecycle events (`class_created`,
  `class_archived`, `join_code_rotated`, `roster_entry_added`,
  `roster_entry_removed`) rather than introducing a parallel logger.
- **`class-validator` DTOs** on every write endpoint, matching the
  auth module's validation pipe and per-field error shape.

**Test coverage:**

- Jest unit tests for join-code generation (format, excluded
  characters, expiry math) and the classes service (join-code
  collision retry, ownership-scoped 404s, rotation invalidating the
  old code, roster soft-delete).
- Jest integration tests against real Postgres
  (`apps/api/test/classes/`) — a teacher in tenant A cannot view,
  rename, archive, rotate the join code of, or modify the roster of a
  class belonging to tenant B (404 in every case); roster add/remove
  correctness (a removed entry disappears from the roster list but
  still exists in the database with `removedAt` set); join-code
  rotation invalidating the old code so a lookup by it fails.
- **Playwright** (`apps/web/e2e/classes.spec.ts`): log in as the
  seeded demo teacher → create a class → see it in the class list →
  open the detail page → see the join code → add a roster entry → see
  it appear → remove it → rotate the join code → confirm the code
  visibly changed, plus the not-found and unauthenticated-redirect
  states. This flow also produced the screenshots below. Running
  multiple spec files against one shared demo account and one shared
  login rate-limit bucket only works if they run strictly serially —
  `playwright.config.ts` now pins `workers: 1` for exactly that reason.

**Demo data:**

`pnpm db:seed` gives the demo teacher (`demo.teacher@questlearn.dev`)
two fictional classes with a few roster entries already in them, so
the class-list and class-detail screens show real populated content
on first login.

**Screenshots** (`docs/screenshots/02-classes/`):

- [`class-list.png`](./docs/screenshots/02-classes/class-list.png)
- [`create-class-form.png`](./docs/screenshots/02-classes/create-class-form.png)
- [`class-detail.png`](./docs/screenshots/02-classes/class-detail.png)
- [`join-code-rotated.png`](./docs/screenshots/02-classes/join-code-rotated.png)

## Module 3 — Questions

A teacher-only question bank: create, edit, and archive questions
across the 5 locked question types, with every edit producing a new,
immutable version. Nothing outside this module can reference a
question yet — Activities (Module 4) are what will eventually "use" a
question in a quiz — so the versioning behavior here is unconditional
rather than a conditional "only version if referenced" check that
couldn't be meaningfully tested until later.

**What it adds:**

- `POST /questions`, `GET /questions`, `GET /questions/:id`, `PATCH
  /questions/:id`, `DELETE /questions/:id` (archive).
- Real Next.js pages: `/questions` (bank list), `/questions/new`
  (type-aware create form), `/questions/[id]` (detail — editor view
  with the answer key, a Preview tab, edit/archive actions), and
  `/questions/[id]/edit` (reuses the same form component, pre-filled).
- A "Question bank" link from `/dashboard`.
- `apps/web/src/lib/api.ts` extended with the question endpoints and
  types, following the same pattern as the classes client.

**Architecture decisions:**

- **Every edit unconditionally creates a new `QuestionVersion`** and
  repoints `Question.currentVersionId` at it — there is no partial
  "patch just this field" edit path. The prior version's row is never
  touched or deleted, so its content stays queryable exactly as it
  was shown at the time.
- **`Question.currentVersionId` is nullable at the schema level only**
  because a `Question` cannot reference its first `QuestionVersion`
  until that row exists (the alternative is a circular FK). The
  service layer creates the `Question` and its v1 `QuestionVersion` in
  a single Prisma transaction, so the field is never observably null
  once a create call returns.
- **`tenantId` is denormalized onto `QuestionVersion`**, the same
  pattern `RosterEntry` already established for `Class` — every
  tenant-scoped query can filter on the child row directly without
  joining through the parent.
- **Every endpoint is tenant *and* owning-teacher scoped**, and
  cross-tenant access 404s rather than returning a distinct 403 —
  identical posture to the classes module.
- **Archived, not deleted**, matching `Class`.
- **No concept tagging** — no `Concept` entity or tag fields exist
  yet; that belongs to the mastery module.
- **`class-validator` DTOs use a single discriminated shape**, not
  five separate DTO subclasses: `QuestionPayloadDto` carries every
  possible field, and a custom `correctAnswerForType` constraint reads
  the sibling `type` (and, for choice types, `options`) field off the
  same DTO instance to validate `correctAnswer`'s shape per type —
  rejecting, for example, a `numeric` question whose
  `correctAnswer.value` isn't a number, or a `single_choice` question
  whose `correctAnswer` isn't one of the supplied option ids.
- **Structured security logging** extends `SecurityLogger` with
  `question_created`, `question_edited` (including the new version
  number), and `question_archived`.

**Test coverage:**

- Jest unit tests for the DTO's per-type validation (`apps/api/test/
  questions/question-payload.dto.spec.ts`) — malformed shapes are
  rejected for all 5 types, not just the happy path — and the service
  layer's versioning logic (`questions.service.spec.ts`): version
  numbers increment from whatever the current version is, not always
  from 1, and cross-tenant edits/archives 404.
- Jest integration tests against real Postgres
  (`apps/api/test/questions/`) — full CRUD, a create → edit → edit
  lifecycle confirming exactly 3 `QuestionVersion` rows exist and the
  current version's points reflect the third edit, and tenant
  isolation (a teacher in tenant A gets a 404 viewing, editing, or
  archiving a question belonging to tenant B, never a distinct 403).
- **Playwright** (`apps/web/e2e/questions.spec.ts`): log in as the
  seeded demo teacher → see the populated question bank → create a new
  single-choice question through the real form → see it in the bank →
  open its detail page → edit it (change the prompt) → confirm the
  version number visibly incremented to 2 → toggle to the preview view
  and confirm it renders the question without any "(correct)" marker
  or answer-key element, plus the not-found and unauthenticated-
  redirect states. This flow also produced the screenshots below.

**Demo data:**

`pnpm db:seed` gives the demo teacher one question of each of the 5
types (a single-choice geography question, a multiple-choice math
question, a true/false science question, a short-text chemistry
question, and a numeric science question) — fictional,
curriculum-plausible content, no real test material.

**Screenshots** (`docs/screenshots/03-questions/`):

- [`question-bank.png`](./docs/screenshots/03-questions/question-bank.png)
- [`create-question-form.png`](./docs/screenshots/03-questions/create-question-form.png)
- [`question-preview.png`](./docs/screenshots/03-questions/question-preview.png)

## Module 4 — Activities

Teachers build quizzes ("activities") from the question bank: draft →
add/order/remove questions → publish. Publishing is a one-time,
irreversible transition that freezes the activity's exact content
forever, even though the underlying questions keep versioning normally.

**What it adds:**

- `POST /activities`, `GET /activities`, `GET /activities/:id`, `PATCH
  /activities/:id` (rename, draft-only), `POST
  /activities/:id/questions` (add), `DELETE
  /activities/:id/questions/:activityQuestionId` (remove, draft-only),
  `PATCH /activities/:id/questions/reorder` (draft-only), `POST
  /activities/:id/publish`, `DELETE /activities/:id` (archive, any
  status).
- Real Next.js pages: `/activities` (list, status badges, question
  counts), `/activities/new` (create form), `/activities/[id]` (the
  builder — ordered question list with move-up/move-down and remove
  controls, a question-bank picker, a confirmation-gated Publish
  button — which becomes a read-only, clearly-locked view once
  published), and `/activities/[id]/preview` (renders every question
  in order, learner-style).
- `QuestionRenderer` (`apps/web/src/components/QuestionRenderer.tsx`)
  extracted out of the Module 3 single-question preview so both the
  question-bank preview and this module's full-activity preview share
  exactly one "render a question learner-style, no answer-key
  emphasis" implementation instead of two copies that could drift.
- An "Activities" link from `/dashboard`, and `apps/web/src/lib/api.ts`
  extended with the activity endpoints and types.

**Architecture decisions:**

- **Draft activities reference questions live; publishing pins exact
  versions.** `ActivityQuestion.pinnedVersionId` stays `null` while
  the parent activity is `draft` — the builder and preview always
  resolve to the question's *current* `currentVersionId`, so editing a
  question that's only used by draft activities is visible
  immediately. `POST /activities/:id/publish` runs one transaction
  that sets `pinnedVersionId` on every row to each question's
  `currentVersionId` *at that exact moment*, then flips the activity
  to `published`. All content resolution (`ActivitiesService`'s
  `resolveContent`) prefers `pinnedVersionId` whenever it's set,
  falling back to the live current version only in the draft state.
  This is the single correctness property the whole module rests on,
  and it works cleanly *because* Module 3's question versioning is
  permanently unconditional (every edit — used or not — creates a new
  version and repoints `currentVersionId`, never mutates a version row
  in place): the pin is just "the version id that existed right then,"
  and nothing can ever retroactively change what that id points to.
- **Publishing is one-time and irreversible.** No unpublish, no
  revising a published activity's title/questions/order — a teacher
  wanting different content creates a new activity. This keeps
  "published" a hard invariant rather than a soft one some later code
  path could quietly violate.
- **No drag-and-drop reordering** — move-up/move-down only, driven by
  `PATCH /activities/:id/questions/reorder`, which validates the
  submitted id array is exactly the activity's current question-id
  set (no more, no less) before reassigning `order`.
- **No per-activity point overrides** — a question's points always
  come from its pinned/current version as-is.
- **Publishing requires at least 1 question**; publishing an empty
  activity is rejected.
- **Archiving is allowed in any status** (draft or published) since
  it's visibility-only — it never touches `ActivityQuestion` rows or
  pinned versions, unlike every other write in this module.
- **Every endpoint is tenant *and* owning-teacher scoped**, 404 (never
  a distinct 403) on cross-tenant or nonexistent access, matching
  classes and questions.
- **Structured security logging** extends `SecurityLogger` with
  `activity_created`, `activity_question_added`,
  `activity_question_removed`, `activity_reordered`,
  `activity_published`, and `activity_archived`.

**Test coverage:**

- Jest unit tests (`apps/api/test/activities/activities.service.spec.ts`):
  publish pins every row to the correct current version inside one
  transaction, rejects publishing with zero questions, rejects
  re-publishing an already-published activity, reorder rejects an id
  array that doesn't exactly match the current question set, and
  draft-only guards reject rename/add/remove/reorder against a
  published activity.
- Jest integration tests against real Postgres
  (`apps/api/test/activities/`): a full lifecycle — create → add 3
  questions → reorder → publish → confirm every `ActivityQuestion.
  pinnedVersionId` matches what was each question's current version at
  that moment — plus tenant isolation (every activity endpoint 404s
  for a teacher outside the owning tenant). **The single most important
  test in this module** publishes an activity, then edits one of its
  underlying questions (creating a new version, per Module 3's
  unconditional-versioning behavior), then re-fetches the published
  activity's detail and asserts the resolved content for that question
  is unchanged — proving the immutability guarantee holds against real
  data and a real subsequent edit, not just that the pinning code
  compiles.
- **Playwright** (`apps/web/e2e/activities.spec.ts`): log in as the
  seeded demo teacher → create an activity → add 3 seeded questions →
  reorder them with the move-up/move-down controls → open the draft
  preview (confirms live content, no answer-key emphasis) → publish
  behind the confirmation dialog → confirm the read-only "Published —
  locked" state (no publish/add/remove/reorder controls remain) →
  edit one of the underlying questions via `/questions/[id]/edit` →
  return to the published activity's preview and assert it still shows
  the pre-edit prompt — the visual, browser-driven proof of
  immutability — plus not-found and unauthenticated-redirect states.
  This flow also produced the screenshots below.

**Demo data:**

`pnpm db:seed` gives the demo teacher one draft activity ("Draft: Solar
System & Numbers Review", 3 of the seeded questions, live content) and
one published activity ("Published: Science & Math Fundamentals", 5 of
the seeded questions, pinned at seed time) — both built from the
existing seeded questions, no duplicate seed content.

**Screenshots** (`docs/screenshots/04-activities/`):

- [`activity-builder.png`](./docs/screenshots/04-activities/activity-builder.png)
- [`question-ordering.png`](./docs/screenshots/04-activities/question-ordering.png)
- [`learner-preview.png`](./docs/screenshots/04-activities/learner-preview.png)

**Known limitations:**

- **No drag-and-drop reordering** — move-up/move-down controls only.
- **No unpublish and no revising a published activity** — structural
  changes require creating a new activity.
- **No per-activity point overrides** — points always come from the
  pinned/current question version.
- ~~No answer-key protection.~~ Resolved in Module 5 for the
  learner-facing attempt surface; the activity preview page itself
  remains a teacher-only, rendering-fidelity choice (no visual
  emphasis on the correct answer), not an enforced boundary — it's
  reached only through the teacher-scoped `/activities/:id` endpoints.

## Module 5 — Assignments and Attempts

Teachers assign a published activity to a class with a due date;
learners — now real accounts, not roster placeholders — join with a
code, take the quiz, and get an automatically graded, tamper-proof
result. This module touches every prior module (auth, classes,
questions, activities) more than any before it: assignments only
accept published activities, attempts grade exclusively against the
version an activity pinned at publish time, and the learner identity
gap left open since Module 2 is resolved decisively here.

**What it adds:**

- `POST /classes/join` — public join-code redemption. With no valid
  learner access token, it creates a real `User{role: learner}` +
  `RosterEntry` and immediately issues a session in the same shape
  `/auth/login` returns (register-then-login collapsed into one step).
  With a valid learner token already present, it skips account
  creation and just links the existing learner to the new class.
  Redeeming a code for a class already actively joined is a no-op that
  returns the existing enrollment.
- `POST /assignments`, `GET /assignments`, `GET /assignments/mine`
  (the learner-facing list, across every class the caller is enrolled
  in), `GET /assignments/:id`, `PATCH /assignments/:id` (`dueAt` only).
- `POST /assignments/:id/attempts/start` (idempotent — returns the
  existing attempt on a repeat call), `GET /attempts/:id`, `PATCH
  /attempts/:id/responses/:activityQuestionId` (autosave), `POST
  /attempts/:id/submit` (the atomic claim pattern — see below).
- Real Next.js pages: `/join` (public redemption form, branches on
  whether the visitor is already an authenticated learner),
  `/activities/[id]/assign` (class picker + due date, lists existing
  assignments for that activity), `/dashboard` (now branches on
  `user.role` — the learner branch lists assignments with status and
  due date), `/assignments/[id]/attempt` (the single-page activity
  player, autosave per response), `/attempts/[id]/result` (score +
  per-question breakdown with the correct answer now shown).
- `QuestionRenderer` gained an interactive mode (`value`/`onChange`
  props) alongside its existing read-only rendering, so the attempt
  player reuses the exact same per-type branches the read-only preview
  already had instead of a second parallel component.

**Architecture decisions:**

- **Real learner accounts, not a parallel login.** Learners are
  `User{role: learner}` rows authenticating through the exact same
  `/auth/login` endpoint teachers use. The one deliberate difference:
  learners skip the email-verification gate entirely (`emailVerifiedAt`
  is set immediately at redemption) — a valid, unexpired, rate-limited
  join code is the trust proxy, not a confirmed inbox.
  `RosterEntry.userId` (new nullable FK) distinguishes a
  redemption-created row from a Module 2 teacher-added placeholder;
  redemption never fuzzy-matches an existing placeholder by name, it
  always creates a new row.
- **Assignments only accept published activities.** Creating an
  assignment from a draft activity is rejected — this is what makes it
  safe for attempt grading to trust `ActivityQuestion.pinnedVersionId`
  unconditionally, never falling back to live content. If a pinned
  version is ever unexpectedly null when grading (structurally
  impossible given that constraint), `AttemptsService` throws rather
  than silently grading against live content — a deliberate fail-loud
  choice.
- **The atomic claim pattern makes submit idempotent by construction,
  not by convention.** `Attempt.status` only ever transitions to
  `submitted` via a `updateMany({ where: { status: "in_progress" } })`
  run *inside* the same transaction as grading — not as a separate
  statement before it. Only the caller whose `updateMany` reports
  `count === 1` grades; every other caller (a genuine duplicate
  request, or the same request racing itself) sees `count === 0` and
  returns the already-graded result unchanged. Doing the claim and the
  grade in one transaction matters for true concurrency: with two
  separate statements, a losing request could read the attempt back
  after the winner's claim commits but before the winner's grade
  commits, observing `status: "submitted"` with a still-null `score` —
  a race this module's own tests caught and closed during development.
- **Generic partial-credit scoring, one formula for all five question
  types.** `fraction = correct/total_correct − incorrect/total_incorrect`,
  clamped to [0, 1] (Master Spec §6.6), implemented once in
  `apps/api/src/attempts/scoring.ts` against "correct set" vs
  "incorrect universe" vs "selected set" abstractions — `multiple_choice`
  is the only type where those sets have more than one member, which is
  what produces real partial credit; every other type has
  `|correctSet| = 1`, so the identical math degenerates to binary 0/1.
  Per-question `pointsAwarded` is that fraction times the question's
  points; the attempt's overall `score` is `sum(pointsAwarded) /
  sum(points)`, clamped again.
- **Answer-key protection is enforced at the service layer, not the
  frontend.** `AttemptsService`'s single content-resolution path strips
  `correctAnswer`/`isCorrect`/`pointsAwarded` from every question
  unless `attempt.status === "submitted"` — verified by a real test
  asserting the raw JSON response body lacks those fields before
  submit and has them after, closing the limitation Modules 3 and 4
  both explicitly deferred ("nothing to leak the answer key to yet").
- **A learner without an active roster entry for the assignment's
  class gets 404, not 403, starting an attempt.** This is a deliberate
  extension of the existing tenant-scoping posture to a learner-facing
  endpoint for the first time: the learner does already know the
  assignment exists (it's only ever reachable from their own
  dashboard), but 403 would still leak the distinction between "this
  assignment doesn't exist" and "you were removed from this class" —
  404 doesn't, and staying consistent with every other module's
  not-found-not-forbidden posture was judged more valuable than a more
  "technically accurate" 403 here.
- **Single-page player, not one-question-at-a-time.** All of an
  assignment's questions render on one page with per-response autosave
  on change — simpler to build and test than a paginated flow, at the
  cost of a longer scroll for large activities.
- **Structured security logging** extends `SecurityLogger` with
  `learner_joined_class`, `assignment_created`, `assignment_updated`,
  `attempt_started`, and `attempt_submitted`.
- **The join-code redemption endpoint shares the same rate-limiting
  treatment as `/auth/login`** (`AUTH_THROTTLE_LIMIT`/
  `AUTH_THROTTLE_TTL_MS`), closing the brute-force gap explicitly
  flagged as a known limitation back in Module 2.

**Test coverage:**

- Jest unit tests: the scoring formula
  (`apps/api/test/attempts/scoring.spec.ts`) — hand-computed
  partial-credit cases for `multiple_choice`, binary cases for the
  other four types, floor/ceiling clamping at both extremes — and the
  submit claim logic in isolation
  (`apps/api/test/attempts/attempts.service.spec.ts`) against a mocked
  Prisma client, asserting the graded-vs-not-graded branch depends only
  on the transaction-scoped `updateMany` count.
- Jest integration tests against real Postgres
  (`apps/api/test/attempts/attempts.integration.spec.ts`,
  `apps/api/test/assignments/tenant-isolation.spec.ts`,
  `apps/api/test/classes/join-rate-limit.spec.ts`): a full lifecycle —
  redeem a join code (asserting it creates a real `User` +
  `RosterEntry` + session) → start an attempt → autosave every response
  → submit → assert the score against a hand-computed expected value.
  **THE IDEMPOTENCY PROOF** is two tests: a sequential duplicate submit
  after the first has completed, and a true-concurrency `Promise.all`
  double submit — both assert identical scores/`submittedAt` and that
  `AttemptResponse.pointsAwarded` never changes on the second call. A
  **frozen-content proof** submits an attempt, edits the underlying
  question via the real `PATCH /questions/:id` (bumping its version),
  and re-fetches the result to confirm its content and score are
  unchanged. An answer-key leakage test asserts the raw response body
  lacks `correctAnswer`/`isCorrect`/`pointsAwarded` pre-submit and has
  them post-submit. Plus tenant isolation for assignments, roster
  membership authorization (an unenrolled learner 404s starting an
  attempt), and a join-code brute-force rate-limit test.
- **Playwright** (`apps/web/e2e/assignments-attempts.spec.ts`): the
  demo teacher assigns the seeded published activity to a new class →
  a brand-new learner redeems the join code through the real `/join`
  form (not an API shortcut) → lands on the dashboard and sees the
  assignment → starts it, answering every question (exercising
  autosave) → submits → sees the result with a real computed score.
  This flow produced the screenshots below, and runs alongside the
  other four spec files in the same serial, single-worker suite.

**Demo data:**

`pnpm db:seed` adds a demo learner account
(`demo.learner@questlearn.dev` / `DemoLearner2026!`) enrolled in
"Period 3 — Earth Science" via a real redemption-shaped `RosterEntry`
(`userId` set), one assignment (the seeded published activity, due in
7 days), and one already-submitted attempt with a real computed score
— not a hardcoded number — so the dashboard and result screenshots
show populated content without a manual redemption step.

**Screenshots** (`docs/screenshots/05-assignments-attempts/`):

- [`assignment-form.png`](./docs/screenshots/05-assignments-attempts/assignment-form.png)
- [`learner-dashboard.png`](./docs/screenshots/05-assignments-attempts/learner-dashboard.png)
- [`activity-player.png`](./docs/screenshots/05-assignments-attempts/activity-player.png)
- [`result.png`](./docs/screenshots/05-assignments-attempts/result.png)

**Known limitations:**

- ~~No mastery/XP/gamification/quest hooks.~~ Resolved in Modules 6-8:
  `AttemptsService.submit()`'s grading transaction now calls
  `MasteryService.recordEvidenceForAttempt`,
  `GamificationService.awardForAttempt`, and
  `QuestsService.evaluateQuestProgressForAttempt` in that order,
  matching the submission-pipeline ordering in Master Spec §10.
- **Single-page player, not one-question-at-a-time** — see the
  architecture decision above.
- **No teacher grade-override UI.** `Attempt.score` is
  system-computed only in this module; a teacher-facing override with
  an audit trail (Master Spec §6/§12) is future work. Revisited and
  reaffirmed, not just carried forward unexamined, in Module 9 — see
  that section's architecture decisions for why the deferral has
  gotten stronger, not weaker, as more idempotent-once subsystems
  shipped in between.
- **No CSV roster import for learners** — redemption is the only
  learner-enrollment path introduced this module; teacher-added
  placeholder rows from Module 2 still exist side by side.

## Module 6 — Mastery

Every graded attempt now also records per-concept mastery evidence,
computed live at read time rather than cached — the same "grade →
mastery" link the master spec's problem statement is built around,
kept structurally separate from grades and XP everywhere: its own
table, its own endpoints, its own UI, never blended into an attempt's
score.

**What it adds:**

- `Concept`/`QuestionConcept` schema plus a tenant+owner-scoped
  `concepts` module: `POST/GET/PATCH/DELETE /concepts`. `PATCH
  /questions/:id/concepts` (in the `questions` module, alongside the
  existing question endpoints) replaces a question's full tag set in
  one call.
- `MasteryEvidence` — append-only, one row per (graded response,
  tagged concept), written inside `AttemptsService.submit()`'s
  existing grading transaction, immediately after scoring, per the
  master spec's submission-pipeline ordering.
- `GET /mastery/me` (learner) and `GET /classes/:id/mastery` (teacher,
  tenant+owner scoped via the class) — both live-computed, no stored
  mastery value read or written anywhere.
- Click-to-reveal hints on the activity player, wired to a new
  `AttemptResponse.hintViewed` flag (set via the existing autosave
  endpoint, extended with an optional `hintViewed` field; never reset
  back to false once true).
- Frontend: a concept-tagging section on the question detail page
  (mirrors the short_text accepted-answers `Tag` pattern), a plain
  `/concepts` CRUD page, a learner `/mastery` view
  (`ProgressBar` + state badge per concept), and a teacher
  `/classes/:id/mastery` view (`StatCard` for class-wide per-concept
  aggregates, `AvatarMetricRow` for the per-learner breakdown).

**Architecture decisions:**

- **Concepts tag the `Question`, not the `QuestionVersion`.** Editing
  a question's wording via the always-versioning flow (Module 3) never
  requires re-tagging, and `PATCH /questions/:id/concepts` has zero
  interaction with the versioning system — no new version, no version
  bump, nothing recorded on `QuestionVersion` at all. The tradeoff:
  mastery evidence can't distinguish "this concept as asked in wording
  A" from "as asked in wording B" — a single, coarser tag per question
  regardless of how its content changes over time.
- **Live-computed mastery, no cache, on purpose — not just because
  it's simpler.** A cached `ConceptMastery` table would only be as
  fresh as its last recompute, which means either a background job
  (explicitly out of scope for this module — no BullMQ, no queue) or a
  score that silently drifts stale between attempts as the recency
  term decays. Computing `recency_weight` against the actual current
  timestamp on every read is what makes "practiced three weeks ago"
  score lower today than it did the day it was recorded, without ever
  re-writing a row — genuinely more correct than a cache, not merely
  less code.
- **The formula** (Master Spec §6.7, assumption A5), with named,
  exported constants rather than inline magic numbers
  (`apps/api/src/mastery/mastery-formula.ts`):

  ```
  effective_response_score = (pointsAwarded / points) × (hintViewed ? 0.85 : 1.0)
  recency_weight(evidence) = 0.5 ^ (days_since_recorded / 14)
  mastery(concept) = Σ(effective_response_score × recency_weight) / Σ(recency_weight)
  ```

  `HINT_PENALTY_MULTIPLIER = 0.85` and `RECENCY_HALF_LIFE_DAYS = 14`
  are the two tunable constants. `responseScore` is frozen onto each
  `MasteryEvidence` row at recording time (the hint-adjusted fraction,
  not the raw fraction) — only the recency term is ever recomputed
  live.
- **State cutoffs, no minimum-evidence gating.** Beginning 0–0.39,
  Developing 0.40–0.69, Proficient 0.70–0.89, Mastered 0.90–1.00 — a
  single evidence row fully determines state. A concept with zero
  evidence for a learner has no mastery row or state at all
  (`"not_started"`), surfaced distinctly from `"beginning"` in both the
  API and UI, never defaulted to a 0 score.
- **Idempotency reuses Module 5's atomic-claim pattern, doesn't
  reimplement it.** `recordEvidenceForAttempt` runs inside the same
  transaction `submit()`'s `updateMany`-conditioned claim already
  guards — only the winning caller ever reaches it — and
  `@@unique([attemptResponseId, conceptId])` makes duplicate evidence
  for the same graded response structurally impossible even if that
  invariant were ever violated.
- **Hint-usage tracking reuses, not duplicates, the autosave
  endpoint's guards.** The same ownership/locked-attempt checks that
  already gate `PATCH /attempts/:id/responses/:activityQuestionId`
  cover the new `hintViewed` field for free — no second endpoint, no
  parallel authorization logic to keep in sync.
- **Structured security logging** extends `SecurityLogger` with
  `concept_created`, `concept_archived`, and
  `question_concepts_updated`.

**Test coverage:**

- Jest unit tests for the formula in isolation
  (`apps/api/test/mastery/mastery-formula.spec.ts`): hand-computed
  cases for the hint penalty, recency decay at zero/one/two half-lives,
  multi-point weighted averages, and all six state-cutoff boundaries
  (0.39/0.40, 0.69/0.70, 0.89/0.90 on both sides).
- Jest integration tests against real Postgres
  (`apps/api/test/mastery/mastery.integration.spec.ts`,
  `apps/api/test/concepts/tenant-isolation.spec.ts`): the full
  tag → grade → evidence → `GET /mastery/me` flow; a two-concept-tagged
  question producing evidence for both; hint-viewed tracking guards
  (per-response isolation, rejected on someone else's or a locked
  attempt); a recency-decay test against directly-inserted evidence
  with controlled `recordedAt` timestamps (a real submission can't time
  travel); tenant isolation on `/concepts`, question tagging, and
  `/classes/:id/mastery`. **THE IDEMPOTENCY PROOF**
  (`mastery.integration.spec.ts`) asserts a concurrent duplicate submit
  creates evidence exactly once per concept, both under a `Promise.all`
  race and a subsequent sequential duplicate.
- **Playwright** (`apps/web/e2e/mastery.spec.ts`): the demo teacher
  creates a concept and tags it onto a seeded question through the real
  UI → assigns the seeded, already-tagged published activity → a
  learner joins, completes it while revealing a hint → the learner's
  `/mastery` view and the teacher's `/classes/:id/mastery` view both
  reflect the same evidence. Produced the screenshots below.

**Demo data:**

`pnpm db:seed` tags the 5 existing seed questions with 3 fictional
concepts (Solar System Basics, Number Theory, States of Matter &
Chemistry) and routes the seeded demo attempt through the real
`MasteryService.recordEvidenceForAttempt` path — not a hand-rolled
duplicate — so the demo has genuine mastery evidence. Idempotent on
reseed like every other seed step.

**Screenshots** (`docs/screenshots/06-mastery/`):

- [`learner-concept-view.png`](./docs/screenshots/06-mastery/learner-concept-view.png)
- [`teacher-class-mastery-view.png`](./docs/screenshots/06-mastery/teacher-class-mastery-view.png)

**Known limitations:**

- **No minimum-evidence-count gating** — see the state-cutoffs
  decision above; a learner can reach "Mastered" off a single lucky
  response, by design (A5's simplified v1 formula).
- **No per-concept difficulty weighting.** Every response contributes
  equally regardless of the underlying question's difficulty or point
  value beyond the fraction it produced — full independence/repetition
  weighting is a documented v2 refinement per assumption A5.
- **Concepts are teacher-scoped, not shared or standardized across
  teachers.** Two teachers each create their own "Fractions" concept
  independently; there's no shared taxonomy or cross-tenant concept
  library.
- ~~No mastery-driven UI elsewhere yet.~~ Resolved in Module 8: a
  `QuestStep` can gate on a mastery threshold, read live off this
  module's evidence via `MasteryService.getMasteryForLearner`/
  `getMasteryForLearnerInTx`.

## Module 7 — Gamification

Every graded attempt now also awards XP and evaluates badge rules,
still deliberately separate from grades and mastery — its own
append-only ledger, its own award-once badge table, never blended into
`Attempt.score` or `MasteryEvidence`.

**What it adds:**

- `XpTransaction` — append-only, `attemptId` unique so idempotency is a
  structural guarantee rather than a defensive check: only the winning
  claim inside `AttemptsService.submit()`'s existing grading
  transaction can ever reach the insert, so a unique violation there
  would mean that invariant broke, and is left to fail loudly rather
  than be silently swallowed.
- `LearnerBadge` — award-once per `(learnerId, badgeType)`, five fixed
  `BadgeType`s (`quest_starter`, `perfect_score`, `concept_champion`,
  `persistent_learner`, `rising_star`), inserted via
  `createMany({ skipDuplicates: true })` as defense in depth on top of
  the unique constraint.
- `GamificationService.awardForAttempt` — called from inside
  `submit()`'s grading transaction, right after mastery evidence is
  recorded, per the master spec's submission-pipeline ordering. Reuses
  `touchedConceptIds` straight from the mastery call rather than a
  second `QuestionConcept` lookup, and calls
  `MasteryService.getMasteryForLearnerInTx` (not the plain,
  committed-only read) so a concept that reaches "mastered" from
  evidence recorded earlier in this SAME transaction is visible for
  the `concept_champion` check without a second round trip after
  commit.
- `GET /gamification/profile` (learner) — total XP, level progress,
  and every earned badge, live-aggregated from `XpTransaction`/
  `LearnerBadge` on every read; no stored "current level" field
  anywhere.
- Frontend: `/xp` (`StatCard` for total XP/level, `ProgressBar` for
  level progress, a fixed 5-badge achievements grid that always
  renders all five, earned or not, so the layout stays legible for a
  learner with zero badges).

**Architecture decisions:**

- **The formula**
  (`apps/api/src/gamification/gamification-formula.ts`), named
  constants rather than inline numbers:

  ```
  xp(attempt) = 20 + round(totalAwardedPoints × 10)
  xpRequiredForLevel(level) = 50 × level × (level − 1)
  ```

  A quadratic level curve (level 2 costs 100 XP, level 3 another 200,
  level 4 another 300, ...) without a lookup table; XP exactly on a
  threshold counts as having reached that level.
- **"Current level" is never stored, only derived** — the only stored
  facts are `XpTransaction` rows; level/progress is computed live from
  `sum(amount)` on every read, mirroring `MasteryService`'s
  no-cached-value precedent from Module 6.
- **Badge rules read already-committed-this-transaction state, not a
  second query round trip.** `concept_champion` specifically needs to
  know "did a concept touched by THIS attempt just become mastered,"
  which requires reading the mastery evidence this same transaction
  already inserted before it commits — exactly why
  `getMasteryForLearnerInTx` exists.
- **No security-logger events for XP/badge awards.** Every other
  mutating action in the app logs a `SecurityEvent`; gamification
  awards are a byproduct of `attempt_submitted` (already logged) and
  don't carry a distinct security-relevant action of their own, so no
  new event types were added for this module — a deliberate omission,
  not an oversight.

**Test coverage:**

- Jest unit tests for the formula in isolation
  (`apps/api/test/gamification/gamification-formula.spec.ts`):
  completion-XP flat award, point-scaled award with rounding on
  fractional points, and the level-threshold table for levels 1–6.
- Jest integration tests against real Postgres
  (`apps/api/test/gamification/gamification.integration.spec.ts`).
  **THE IDEMPOTENCY PROOF** drives the real HTTP surface: a concurrent
  duplicate submit (`Promise.all`) creates exactly one `XpTransaction`
  row and no duplicate badges; a second, separately-perfect attempt for
  the same learner doesn't duplicate the award-once `perfect_score`
  badge.
- **Playwright** (`apps/web/e2e/gamification.spec.ts`): the demo
  teacher assigns the seeded published activity to a fresh class → a
  learner joins, completes it, and submits → their `/xp` page reflects
  the XP award and the `quest_starter` badge. Screenshots captured from
  the seeded demo learner's own separately-earned profile, not the
  spec's own throwaway class/learner.

**Demo data:**

`pnpm db:seed` routes the seeded demo attempt through the real
`GamificationService.awardForAttempt` path (not a hand-rolled
duplicate), so the demo learner's `/xp` page shows genuine XP and a
real `quest_starter` badge from their one seeded submitted attempt.

**Screenshots** (`docs/screenshots/07-gamification/`):

- [`xp-profile.png`](./docs/screenshots/07-gamification/xp-profile.png)
- [`level-progress.png`](./docs/screenshots/07-gamification/level-progress.png)
- [`achievements.png`](./docs/screenshots/07-gamification/achievements.png)

**Known limitations:**

- **No badge for quest completion yet** — `LearnerBadge`'s five
  `BadgeType`s are all attempt/mastery-driven; Module 8 tracks its own
  completion reward in a separate `QuestCompletion` table rather than
  adding a sixth shared badge type (see Module 8 below for why).
- **XP/level curve constants are fixed**, not teacher-configurable —
  reasonable for an MVP portfolio project, but a real deployment might
  want per-tenant tuning.

## Module 8 — Quests

Quest steps chain together everything Modules 4–7 built: a step gates
on completing an `Activity`, reaching a mastery threshold on a
`Concept`, or both — linear, non-branching progression, ending in a
single, idempotent reward when every step is satisfied.

**What it adds:**

- `Quest`/`QuestStep`/`QuestCompletion` schema. A step references an
  `Activity`, a `Concept` + required mastery state, or both (AND, not
  OR — no separate operator field; which of the two nullable
  references the teacher populated IS the configuration). At least one
  gate is required, enforced at the service layer since it spans
  multiple optional columns.
- Teacher CRUD: `POST/GET/PATCH/DELETE /quests`, step
  add/edit/remove/reorder under `/quests/:id/steps`. No draft/publish
  lifecycle like `Activity` — a created quest is immediately visible
  tenant-wide, since a reorderable, ungraded step list carries none of
  the grading-integrity risk that justifies `Activity`'s
  draft→published→immutable machinery.
- Learner reads: `GET /quests` (tenant-wide list with live progress)
  and `GET /quests/:id` (per-step complete/unlocked flags), both fully
  derived from existing `Attempt`/`MasteryEvidence` data — no stored
  per-learner-per-step state anywhere.
- `QuestsService.evaluateQuestProgressForAttempt`, called from inside
  `AttemptsService.submit()`'s grading transaction right after
  gamification's award, per the master spec's submission-pipeline
  ordering. Only quests referencing the just-graded attempt's activity
  or touched concepts are re-checked, not every tenant quest.
- Frontend: `/quests` + `/quests/new` + `/quests/[id]` (teacher
  builder — activity/concept pickers resolved by name, matching the
  established assignment-form select pattern) and `/quests/map`
  (learner — the design system's existing `QuestStepper` component,
  locked/active/completed derived from the API's live progress).

**Architecture decisions:**

- **No stored step-completion or unlock-cursor state, by the same
  reasoning as Mastery (Module 6) and Gamification (Module 7).** A
  step's gates are both fully derivable from data that already exists;
  the ONLY new per-learner fact that can't be derived — because it's a
  one-time event, not a query result — is "was the reward already
  issued," which is exactly what `QuestCompletion` exists for and
  nothing else does.
- **The unlock cursor is a display concept only, not enforcement.**
  `Attempt`/`Assignment` have zero coupling to `Quest` in the data
  model — assignments are class-wide, quest progress is per-learner —
  so nothing can actually block a learner from satisfying a later
  step's raw condition before an earlier one (e.g. via a separately
  assigned activity). Quest completion is therefore "every step's gate
  holds," independent of the order in which they became true; the
  unlock cursor only controls what the quest MAP shows as active vs.
  locked.
- **`QuestCompletion` is its own reward ledger, deliberately not
  merged into Module 7's `XpTransaction`.** Quest XP is tracked and
  displayed on the quest map itself, not blended into `/xp`'s total —
  keeps quest-completion reward as its own surface and leaves Module
  7's already-shipped schema untouched.
- **`QuestCompletion`'s idempotency is defense-in-depth
  (`skipDuplicates`), not fail-loud like `XpTransaction`'s — a
  deliberate, reasoned difference, not an inconsistency.**
  `XpTransaction`'s uniqueness can safely be fail-loud because only the
  single winning claim inside ONE attempt's `submit()` transaction can
  ever reach that insert. A quest's last step has no such guarantee: it
  can be satisfied by TWO DIFFERENT attempts' own evidence,
  independently, in two genuinely separate transactions that can't see
  each other's uncommitted writes — a real, expected race, not a broken
  invariant.

**Test coverage:**

- Jest unit tests for the pure gate/formula logic in isolation
  (`apps/api/test/quests/quest-formula.spec.ts`): activity-only,
  mastery-only, and combined (AND) step completion; the unlock-cursor
  walk; the XP formula.
- Jest integration tests against real Postgres
  (`apps/api/test/quests/quests.integration.spec.ts`): gate validation
  (neither gate / mismatched mastery gate / draft-activity gate all
  rejected), tenant isolation (404, not 403), and a full 3-step gating
  flow (activity-only → mastery-only → combined) driven entirely by
  real `Attempt` submissions and mastery evidence, proving the unlock
  cursor and reward fire at exactly the right moments.
- **THE CONCURRENCY PROOF**
  (`apps/api/test/quests/quests-concurrency.integration.spec.ts`)
  proves the DIFFERENT race `QuestCompletion` actually faces (see
  above): two concurrent, independently-sufficient attempts (separate
  transactions, each with its own evidence enough alone to reach
  "mastered") race to complete the same quest; exactly one
  `QuestCompletion` survives, confirmed stable across repeated runs.
- **Playwright** (`apps/web/e2e/quests.spec.ts`): the demo teacher
  builds a quest with a step gated on the seeded published activity
  through the real UI — since the demo learner already has a submitted
  attempt for that activity, the step reads as complete immediately,
  proving gate evaluation reuses existing data live rather than
  requiring a fresh submission for this specific quest instance.
  Screenshots captured from the seeded "Science & Math Explorer" quest
  and the seeded demo learner's map from the first commit, not fixed up
  afterward.

**Demo data:**

`pnpm db:seed` adds a 2-step "Science & Math Explorer" quest reusing
the same published activity and "Number Theory" concept the demo
learner's seeded attempt already touched (and answered the Number
Theory question wrong on) — so the two steps land in genuinely
different states (one already complete, one unlocked but short of the
mastery threshold) without hand-setting anything.

**Screenshots** (`docs/screenshots/08-quests/`):

- [`quest-builder.png`](./docs/screenshots/08-quests/quest-builder.png)
- [`learner-quest-map.png`](./docs/screenshots/08-quests/learner-quest-map.png)

**Known limitations:**

- **Quests are tenant-wide, not per-class assigned** — unlike
  `Activity`'s `Assignment` model, there's no `QuestAssignment`
  concept; every learner in the tenant sees every non-archived quest.
- **No draft/publish lifecycle for quests** — a created quest is
  immediately live; see the architecture decision above for why this
  doesn't carry the same risk `Activity` guards against.
- **The unlock cursor doesn't gate `Attempt` creation** — see the
  architecture decision above; a learner can technically satisfy a
  later step before an earlier one.
- **Team-based quests and streaks are not built** — not mentioned
  anywhere in the master spec (not even on the Phase 2 list, which is
  scoped narrowly to Live Sessions), so these get the same "out of
  scope entirely" treatment as institution admin or guardian accounts.

## Module 9 — Reporting and Administration

Closes the real gap an earlier connectivity audit flagged: there was
no teacher-facing view of attempt results anywhere in the product.
Every number on every view here is derived, on every read, from data
Modules 5–8 already made queryable — no new stored state, same
discipline as Mastery, Gamification, and Quests.

**What it adds:**

- `GET /classes/:id/report` (teacher dashboard) — per-assignment
  completion rate and average score, a compact per-concept mastery
  state-count summary (linking to Module 6's full grid rather than
  re-rendering it), and a roster list linking to each registered
  learner's own report.
- `GET /classes/:id/report/csv` — CSV export of that same per-
  assignment table, generated synchronously in the request/response
  cycle by a small hand-rolled RFC 4180-style encoder
  (`report-formula.ts`'s `toCsv`) — no new dependency, no background
  job.
- `GET /activities/:id/report` (question analysis) — per-question
  correct rate, average points awarded, and hint-view rate across
  every submitted response to the activity, aggregated across every
  class it's assigned to (analysis of the authored content, not one
  class's usage of it).
- `GET /classes/:classId/learners/:learnerId/report` (learner report)
  — a teacher's full-picture view of one student: attempt history plus
  `MasteryService.getMasteryForLearner`, `GamificationService.getProfile`,
  and `QuestsService.findAllForLearner` composed almost entirely as-is.
- Frontend: `/classes/[id]/report`, `/activities/[id]/report`, and
  `/classes/[id]/learners/[learnerId]/report` — plain styled div rows
  (no new design-system components needed), a "Download CSV" button
  (fetch → Blob → client-side download, since the endpoint needs the
  Bearer token a plain `<a href>` can't carry), linked from the class
  detail page and the published-activity detail page.

**Architecture decisions:**

- **Every rate returns `null`, never `0`, when its denominator is
  zero.** "No data yet" and "zero percent" are different facts;
  collapsing them would misreport an untouched assignment as a 0%
  completion rate instead of "nothing to report yet."
- **`assignedCount` uses the class's CURRENT active roster size for
  every assignment**, including older ones — a teacher reads
  "assigned" as "how many of my enrolled students should have done
  this," and no historical roster snapshot exists anywhere to
  reconstruct (`RosterEntry.removedAt` only marks removal, not "as of
  when"). Documented as a known limitation, not silently glossed over.
- **The learner report's `classId` is authorization-only.** The URL
  proves the teacher has a legitimate relationship to this learner (an
  active roster entry in a class they own); the report CONTENT spans
  every class this teacher teaches the learner in, not just that one
  — a teacher reasonably wants the whole picture of a student they see
  in multiple sections, and it's still fully tenant+teacher scoped
  throughout.
- **Live-computed, not a background export job — a scale call, not a
  default.** A tenant here is one teacher's workspace: a handful of
  classes, dozens of learners, a handful of assignments. These
  aggregate queries are no heavier than what `MasteryService`/
  `GamificationService` already compute live on every read, and §7's
  NFR explicitly scopes production-scale load testing out of MVP. A
  background job would solve a problem that doesn't exist at this data
  volume and would break the "derive, don't duplicate" principle for
  no benefit — flagged as a known limitation if that scale assumption
  ever stops holding, not solved preemptively.
- **FR#11 (notification records) and FR#12 (audit log) are both
  explicitly deferred, not built.** Notifications have zero
  infrastructure anywhere in 8 prior modules — no trigger call, no UI
  hook — and aren't listed in §14's Module 9 screenshot row or §20's
  Definition of Done; building them as a side effect of a *reporting*
  module would be peer-feature scope creep. Audit log is structurally
  tied to grade overrides, manual XP/badge changes, and permission
  changes — none of which have any mutation path built, so a log with
  nothing real to audit would itself violate the DoD's "no
  placeholder/TODO code paths" rule. The real question underneath is
  whether to finally build grade override: **no** — Modules 6–8
  shipped XP/mastery/quest logic that is deliberately append-only and
  idempotent-once, with no reversal path designed in anywhere
  (`XpTransaction` has no adjustment concept, `LearnerBadge` is
  award-once with no revoke, `QuestCompletion` the same). A real
  override means deciding, for four previously-shipped and carefully-
  reasoned subsystems, what "the grade changed after the fact" means
  for already-recorded evidence/XP/badges/quest completions — a
  correctness-critical redesign, not a reporting task, and a
  genuinely *larger* deferral than Module 5's original one now that
  three more subsystems depend on scores being immutable.

**Test coverage:**

- Jest unit tests for the formula in isolation
  (`apps/api/test/reports/report-formula.spec.ts`): the null-not-zero
  guard on every rate, and CSV escaping (commas, quotes, newlines).
- Jest integration tests against real Postgres
  (`apps/api/test/reports/reports.integration.spec.ts`) against a
  controlled fixture (2 questions, a 4-entry roster: 2 real submitters,
  1 learner who never starts, 1 teacher-added placeholder with no
  account) so every number is independently hand-checkable rather than
  just plausible: completion rate/average score against real submitted
  scores, CSV headers/content/formatting, per-question correctness and
  hint-view rate, learner report composition, the roster-membership
  authorization boundary, and tenant isolation (404 not 403) on all
  four endpoints.
- **Playwright** (`apps/web/e2e/reports.spec.ts`) — unlike every prior
  module's spec file, this one creates nothing: every view is a direct
  read of the seeded demo teacher's real data, so navigating straight
  to the seeded class/activity/learner pages IS the real flow, plus a
  real CSV download intercepted and its header row verified. Produced
  the three screenshots below.

**Screenshots** (`docs/screenshots/09-reporting-admin/`):

- [`teacher-dashboard.png`](./docs/screenshots/09-reporting-admin/teacher-dashboard.png)
- [`question-analysis.png`](./docs/screenshots/09-reporting-admin/question-analysis.png)
- [`learner-report.png`](./docs/screenshots/09-reporting-admin/learner-report.png)

**Known limitations:**

- **Notification records (FR#11) are not built** — see the
  architecture decision above; no trigger infrastructure exists
  anywhere in the app yet.
- **Audit log (FR#12) is not built**, and neither is teacher-facing
  grade override — see the architecture decision above for the full
  reasoning. Both remain future work, deliberately deferred rather
  than built hollow.
- **CSV export covers the class dashboard's assignment table only** —
  question analysis and the learner report are UI/JSON-only for now;
  a reasonable follow-up, not built preemptively.
- **`assignedCount` has no historical roster snapshot** — see the
  architecture decision above; an older assignment's "assigned" count
  reflects who's enrolled today, not who was enrolled when it was due.

## Module 10 — Security, Accessibility, and Production Hardening

No new UI per §14's checklist ("no new UI — security/a11y/perf pass on
existing screens") — this module is a hardening pass over the 9
modules already built, starting from a concrete, evidence-based
checklist rather than a blank slate. Full detail lives in
[`SECURITY_NOTES.md`](./SECURITY_NOTES.md) and
[`TESTING_REPORT.md`](./TESTING_REPORT.md), both new in this module
(required by §20's Definition of Done, and both genuinely absent
before now); this section is the summary.

**What it adds:**

- **Dependency remediation**: `pnpm audit --prod` went from 44
  vulnerabilities (19 high) to 1 — the pinned `next@14.2.35` accounted
  for 17 findings, resolved by a full Next.js 14→15 (+ React 18→19)
  upgrade in its own isolated commit; the rest (`multer`, `js-yaml`,
  `lodash`, `qs`, `file-type`, `postcss`, `nanoid`, `sharp`,
  `body-parser`, `deepmerge-ts`) were all transitive leaves, closed via
  `pnpm.overrides`. The single remaining finding
  (`@nestjs/core`, moderate) is deliberately deferred, not missed —
  see `SECURITY_NOTES.md` for the specific advisory and reasoning.
- **Security headers**: `helmet` on the API with a fully closed CSP
  (nothing inherited from helmet's defaults), a separately relaxed
  policy scoped to Swagger UI's own path, and matching headers +
  a real CSP on the Next.js app — the actual browser-facing surface,
  where the `fonts.gstatic.com` allowance for the design system's
  self-hosted fonts actually matters.
- **Accessibility**: a real, deliberate `:focus-visible` outline on
  every text input (`Input.tsx` had suppressed it with no
  replacement — [before](./docs/screenshots/10-hardening/focus-indicator-before.png)
  / [after](./docs/screenshots/10-hardening/focus-indicator-after.png),
  not spec-required per §14 but captured as evidence anyway), two more
  keyboard-operability bugs found and fixed while auditing the rest of
  the design system (`Switch`, `Tag`), and three contrast failures
  fixed with values computed via the actual WCAG formula (`Badge`'s
  status tones, `--text-secondary`) — not eyeballed, not assumed
  passing.
- **Production Dockerfiles**: `apps/api/Dockerfile` and
  `apps/web/Dockerfile` — neither existed before this module (only
  local Postgres/Redis infra had a Compose file). Verified end-to-end
  as real containers on the real docker-compose network, not just a
  successful `docker build`.
- **CORS hardening**: `WEB_URL` is now a required env var; the
  permissive `origin: true` fallback for an unset value is gone.

**Test coverage:** every fix in this module was verified individually
before being committed — a real browser session for every CSS/header
change (computed styles, console CSP-violation checks, not just
"the build passed"), the full 269-test Jest suite and 48-test
Playwright suite re-run after each change that could plausibly affect
them, and both Docker images proven with a real login flow through
containerized instances of both apps. Full detail, including the
fresh-environment final verification pass, in `TESTING_REPORT.md`.

**Known limitations:**

- **`@nestjs/core`'s one remaining moderate CVE is deliberately
  deferred** — a NestJS v10→v11 migration's breaking-change surface
  (Express v5's route matching, reversed lifecycle-hook order,
  `Reflector` API changes) doesn't belong bundled into the same module
  as a Next.js major bump. See `SECURITY_NOTES.md`.
- **The API's Docker image ships devDependencies** — the runtime
  stage copies the build stage's full `node_modules` rather than a
  scoped prod-only install, because the workspace's root `postinstall`
  script fires regardless of `--prod` and has no `tsc` to run without
  devDependencies present. Larger image than strictly necessary; a
  documented tradeoff for build reliability, not an unnoticed gap.
- **`Switch`'s unchecked-track color** measures ~1.44:1 against the
  page background, short of the 3:1 non-text contrast guideline —
  not fixed here since `Switch` isn't wired into any live page yet.
- **No automated accessibility test suite or dedicated SAST/DAST
  tool** — this module's a11y and security-scan work were manual
  audits, not new automated regression coverage. Reasonable follow-up
  work, not required for this module's scope.

## Testing

- **Jest** — unit tests for both apps (health service, auth service,
  classes service, questions service, activities service, assignments
  scoring, attempt submit-claim logic, the mastery formula, the
  gamification formula, the quest gate/formula logic, the reporting
  formula, question DTO validation, join-code generation, a render
  smoke test for the status page) plus real-Postgres integration tests
  for the auth session lifecycle, classes lifecycle, questions
  lifecycle and versioning, activities lifecycle and publish-
  immutability, the full assignments/attempts lifecycle (including the
  idempotency and frozen-content proofs), the mastery evidence/query
  lifecycle (including its own idempotency proof and a recency-decay
  test), the gamification award lifecycle (including its own
  idempotency proof), the quest CRUD/gating/reward lifecycle
  (including its own concurrency proof — a structurally different race
  than XpTransaction's, see Module 8 above), the four report endpoints
  against a hand-checkable fixture (see Module 9 above), tenant
  isolation (auth, classes, questions, activities, assignments,
  concepts, mastery, quests, and reports), and rate limiting (auth and
  join-code redemption).
- **Playwright** (`apps/web/e2e/`) drives the real auth, class
  management, question bank, activity-builder,
  assignment/attempt/result, concept-tagging/mastery,
  gamification/XP, quest-building/quest-map, and reporting flows
  through a real browser against the real running app — see Module 1
  through Module 9 above. Module 10 adds no new flow (no new UI to
  test) but re-runs all 48 tests against the production build with
  Module 10's security headers/CSP active, confirming they don't break
  any existing journey.
- **Docker**: `apps/api/Dockerfile` and `apps/web/Dockerfile`, both
  verified as real running containers on the docker-compose network
  with a real login flow through the browser — see Module 10 above and
  `TESTING_REPORT.md`.

## Known limitations

**Module 0:**

- The repository is private until the Module 1 authentication
  checkpoint passes, per the repository policy in the master spec.

**Module 1:**

- **No real email provider is wired up.** `EmailService` is an
  abstraction with one implementation, `DevEmailService`, which logs
  the verification/reset token to the server log instead of sending
  anything — see `apps/api/src/auth/email/email.service.ts`. A real
  provider (Postmark, SES, etc.) can implement the same interface
  later without touching `AuthService`.
- **Fonts, the logo, and icons are still placeholders** in
  `@questlearn/design-system` — see that package's own README for
  details. Nothing about this blocks building functional, correctly
  styled pages against the tokens and components as they are.
- No feature/business logic (quizzes, quests, XP, mastery) exists yet
  — intentionally out of scope for this module.

**Module 2:**

- ~~No learner-facing join flow.~~ Resolved in Module 5:
  `POST /classes/join` creates a real learner account and roster entry
  in one step.
- **No CSV roster import.** Roster entries are added one at a time
  through the inline form; bulk import is a reasonable future
  addition but wasn't required for this module's scope.
- ~~No join-code brute-force rate limiting yet.~~ Resolved in Module 5:
  the redemption endpoint shares `AUTH_THROTTLE_LIMIT`/
  `AUTH_THROTTLE_TTL_MS` with `/auth/login`.

**Module 3:**

- ~~No answer-key protection.~~ Resolved in Module 5 for the
  learner-facing attempt surface: `GET /attempts/:id` strips
  `correctAnswer`/`isCorrect`/`pointsAwarded` before submit. `GET
  /questions/:id` itself is still unrestricted to the owning teacher,
  which remains correct — it's a teacher-only, tenant-scoped endpoint,
  not one a learner session can reach.
- ~~No concept tagging.~~ Resolved in Module 6: concepts attach to the
  `Question` (not `QuestionVersion`) via `PATCH
  /questions/:id/concepts`.
- **Only the 5 locked question types** are supported: single choice,
  multiple choice, true/false, short text, numeric. No matching,
  ordering, or drag-and-drop types.
- **No bulk import.** Questions are added one at a time through the
  form; bulk import (CSV, question-bank exchange formats) is a
  reasonable future addition but wasn't required for this module.

## License

MIT — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
