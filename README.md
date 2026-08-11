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

**Module 0 — Foundation** (workspace, tooling, health checkpoint),
**Module 1 — Authentication** (teacher registration, login, sessions),
and **Module 2 — Classes** (class CRUD, join codes, roster management)
are all in place. See [Module 1 — Authentication](#module-1--authentication)
and [Module 2 — Classes](#module-2--classes) below for what each module
covers.

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

## Setup (clean machine)

1. **Install Node 24.** Version pinned in `.nvmrc` / `.node-version`
   (currently `24.15.0`). If you use `nvm`: `nvm use`.
2. **Install pnpm 11.20.0**: `corepack enable && corepack prepare pnpm@11.20.0 --activate`
   (or `npm install -g pnpm@11.20.0`).
3. **Clone and install dependencies:**
   ```
   git clone https://github.com/SeifMoussa/questlearn.git
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
   values for `SESSION_SECRET` / `CSRF_SECRET` / `JWT_SECRET` before
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

## Testing

- **Jest** — unit tests for both apps (health service, auth service,
  classes service, questions service, question DTO validation,
  join-code generation, a render smoke test for the status page) plus
  real-Postgres integration tests for the auth session lifecycle,
  classes lifecycle, questions lifecycle and versioning, tenant
  isolation (auth, classes, and questions), and rate limiting.
- **Playwright** (`apps/web/e2e/`) drives the real auth, class
  management, and question bank flows through a real browser against
  the real running app — see Module 1, Module 2, and Module 3 above.

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

- **No learner-facing join flow.** A roster entry is a name (and
  optional email) the teacher types in — not an account, and nothing
  a learner can use to log in. The real "redeem a join code" flow is
  deferred to a later module, once there's learner-facing content
  (activities, assignments) for a learner session to actually reach.
- **No CSV roster import.** Roster entries are added one at a time
  through the inline form; bulk import is a reasonable future
  addition but wasn't required for this module's scope.
- **No join-code brute-force rate limiting yet.** The join-code
  rotation endpoint is authenticated and tenant/owner-scoped like
  every other endpoint in this module, but there is no *redemption*
  endpoint yet (nothing that accepts a bare code and looks up a
  class), so there's nothing for a brute-force attempt to target.
  Rate limiting the eventual redemption endpoint is that future
  module's concern, not something silently skipped here.

**Module 3:**

- **No answer-key protection.** `GET /questions/:id` returns the full
  answer key (`correctAnswer`) to any authenticated request scoped to
  the owning teacher's tenant — there is no learner-facing surface in
  this module yet (Activities don't exist until Module 4), so there's
  nothing to leak the answer key *to*. The detail page's Preview tab
  renders the question the way a learner eventually will, with no
  visual emphasis on the correct answer, but that's a rendering-
  fidelity concern, not an enforced security boundary yet. Real
  answer-key protection (hiding `correctAnswer` from any endpoint a
  learner session can reach) is required once Module 4/5 introduce a
  learner-facing attempt flow.
- **No concept tagging.** No `Concept` entity, no tag fields on
  `Question` or `QuestionVersion` — that belongs to the mastery
  module.
- **Only the 5 locked question types** are supported: single choice,
  multiple choice, true/false, short text, numeric. No matching,
  ordering, or drag-and-drop types.
- **No bulk import.** Questions are added one at a time through the
  form; bulk import (CSV, question-bank exchange formats) is a
  reasonable future addition but wasn't required for this module.

## License

MIT — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
