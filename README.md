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

**Module 0 — Foundation.** No feature/business logic yet. This module
sets up the workspace, tooling, and a real health checkpoint that later
modules build on.

## Architecture

```
apps/web     Next.js (App Router) frontend
apps/api     NestJS backend
packages/config   shared env validation, tsconfig, ESLint/Prettier config
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
   values for `SESSION_SECRET` / `CSRF_SECRET` before using this outside
   a local sandbox.
6. **Run the apps in development:**
   ```
   pnpm dev:api   # http://localhost:4000  (health: /health, docs: /api/docs)
   pnpm dev:web   # http://localhost:3000
   ```
7. **Run tests:**
   ```
   pnpm test
   ```

## System status checkpoint

`apps/web`'s root page calls the API's `/health` endpoint, which runs a
real query against Postgres and a real `PING` against Redis, and renders:

```
QuestLearn — Web: Running / API: Connected / Database: Connected / Redis: Connected / Environment: Development
```

The page shows a loading state while the check is in flight and a
degraded state (without crashing) if the API or a dependency is down.

Screenshot: [`docs/screenshots/00-foundation/01-system-status.png`](./docs/screenshots/00-foundation/01-system-status.png)

## Testing

- **Jest** — unit tests for `apps/api` (health service, with the
  Postgres and Redis clients mocked) and a render smoke test for
  `apps/web`'s status page.
- **Playwright** is introduced starting Module 1, once there's an
  actual user flow (registration/login) worth driving through a real
  browser.

## Known limitations (Module 0)

- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, and
  build, but does not start Postgres/Redis service containers — the
  health check unit test mocks both clients, so nothing in CI yet
  requires live infrastructure. Real integration tests against live
  Postgres/Redis start in Module 1 alongside the first database
  migrations.
- No authentication, database schema, or feature modules exist yet —
  intentionally out of scope for this module.
- The repository is private until the Module 1 authentication
  checkpoint passes, per the repository policy in the master spec.

## License

MIT — see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md).
