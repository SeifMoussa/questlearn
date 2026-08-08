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

**Module 0 — Foundation** (workspace, tooling, health checkpoint) and
**Module 1 — Authentication** (teacher registration, login, sessions)
are both in place. See [Module 1 — Authentication](#module-1--authentication)
below for what that module covers.

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

## Testing

- **Jest** — unit tests for both apps (health service, auth service,
  a render smoke test for the status page) plus real-Postgres
  integration tests for the auth session lifecycle, tenant isolation,
  and rate limiting.
- **Playwright** (`apps/web/e2e/`) drives the real auth flow through a
  real browser against the real running app — see Module 1 above.

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

## License

MIT — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
