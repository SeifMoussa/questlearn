# Security Notes

Reflects what's actually implemented and verified as of Module 10
(Security, Accessibility, and Production Hardening) — not a policy
aspiration. See [`SECURITY.md`](./SECURITY.md) for the vulnerability
disclosure process.

## Authentication and session management

- **Argon2id** password hashing (`apps/api/src/auth/auth.service.ts`),
  never a faster/weaker algorithm.
- **Generic "invalid credentials" errors** on login — no
  account-existence leakage (a nonexistent email and a wrong password
  return the identical response).
- **Short-lived JWT access tokens + rotating refresh tokens.** Refresh
  is single-use: each `/auth/refresh` call issues a new refresh token
  and invalidates the old one, so a stolen refresh token has a
  bounded, self-limiting window rather than indefinite validity.
- **Email verification and password reset** use one-time tokens, not
  the account password itself, to authorize the action.

## Authorization and tenant isolation

- Every table carries `tenantId`; every read/write path filters on it
  server-side, never trusts a client-supplied tenant claim beyond the
  JWT's own.
- **Cross-tenant and cross-owner access always 404s, never 403s** —
  verified repo-wide, module by module, so a response can never be
  used to confirm a resource id exists outside the caller's scope.
  Covered by a dedicated `tenant-isolation.spec.ts` in every module
  that has resources to isolate (auth, classes, questions, activities,
  assignments, concepts, mastery, quests, reports).
- **Correct answers are never sent to an in-progress learner session**
  — `GET /attempts/:id` strips `correctAnswer`/`isCorrect`/
  `pointsAwarded` before submit; only the grading response and the
  post-submit detail view include them.

## Rate limiting

- `AUTH_THROTTLE_LIMIT`/`AUTH_THROTTLE_TTL_MS` — applied to
  register/login/forgot-password and join-code redemption
  (`/classes/join`), the sensitive unauthenticated endpoints, via a
  per-route `@Throttle()` override.
- `GLOBAL_THROTTLE_LIMIT`/`GLOBAL_THROTTLE_TTL_MS` — applied to every
  other endpoint (notably `/auth/refresh` and every plain GET read)
  via the app-wide default `ThrottlerGuard`. Both are env-driven, not
  hardcoded literals, with production-safe defaults (5/60s and
  100/60s respectively) — dev/test raise them via `.env`/
  `.env.example`/CI the same way, so a growing Playwright suite's
  request volume doesn't trip the limit without loosening what
  production actually enforces.
- Join codes are additionally scoped: 8-character crypto-random codes
  (~2^40 keyspace), expiring, teacher-rotatable, and created through a
  P2002-catch-and-retry wrapper that closes the TOCTOU race between
  the uniqueness check and the write (see `classes.service.ts`'s
  `withUniqueJoinCodeRetry`).

## Input validation and injection defenses

- **Schema validation on every write** via `class-validator` DTOs,
  applied through a global `ValidationPipe`.
- **CSV formula injection** (`report-formula.ts`'s `toCsv`): a cell
  value starting with `=`, `+`, `-`, or `@` is prefixed with a leading
  single quote before RFC 4180 quote/comma/newline escaping — the
  OWASP-documented mitigation for a field that would otherwise execute
  as a live formula when the export is opened in Excel/Sheets.
- **Structured security logging** (`SecurityLogger`) for auth events,
  permission denials, and audited actions (class/question/activity
  create/update/archive, join-code rotation, publish, learner joins,
  etc.) — no plaintext secrets or answer content ever logged.
- Secrets (`JWT_SECRET`, `CSRF_SECRET`, `DATABASE_URL`, `REDIS_URL`,
  `WEB_URL`) are required env vars validated at startup (`loadEnv()`
  in `packages/config/src/env.ts`) — a missing or malformed value is a
  fail-fast boot error, not a silent runtime surprise. `.env` is
  gitignored from commit 1; `.env.example` ships safe placeholders
  only.

## Module 10 hardening

### Dependency vulnerabilities

`pnpm audit --prod` reported **44 vulnerabilities (19 high)** at the
start of this module. Remediated to **1 remaining (moderate,
deliberately deferred — see below)**:

- **17 findings** traced to the pinned `next@14.2.35` (multiple
  SSRF/DoS/cache-poisoning CVEs) — resolved by upgrading to
  `next@15.5.21+` (resolved `15.5.23`), alongside the required
  `react`/`react-dom` 18→19 bump. Full re-test (typecheck, lint,
  production build, full Jest + Playwright suites) confirmed clean;
  Next 15's headline breaking change (async `params`/`searchParams`/
  `cookies()`/`headers()` in Server Components) has zero surface here
  — every dynamic route is a `"use client"` page using the synchronous
  `useParams()` hook, confirmed by grep before starting the bump, not
  assumed.
- **Remaining findings** (`multer`, `js-yaml`, a stale `lodash` copy,
  `qs`, `file-type`, `body-parser` — all riding in through
  `@nestjs/*`'s own dependency tree; `postcss`/`nanoid`/`sharp` bundled
  inside `next`'s own tree; `deepmerge-ts` via prisma's CLI tooling) —
  resolved via `pnpm.overrides` in `pnpm-workspace.yaml`, forcing each
  to its patched version while staying within its current major
  version (a same-major leaf-dependency bump, not an API surface this
  app calls directly).

### Deferred: `@nestjs/core` (moderate, CWE-74)

[GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75)
— "Improperly Neutralizes Special Elements in Output Used by a
Downstream Component" — is patched only in `@nestjs/core@11.1.18+`;
`10.4.22` (the latest 10.x release) has no back-ported fix, and it's
`@nestjs/core` itself that's flagged, not a transitive leaf, so a
`pnpm.overrides` entry can't reach it.

**Deliberately not bundled into this module.** A NestJS v10→v11
migration carries real breaking-change surface — Express v5's changed
route-matching algorithm (every `:id` route and the throttler),
reversed lifecycle-hook termination order, and `Reflector`'s changed
return shape for `getAllAndMerge` (used by this app's custom guards) —
on top of the Next.js major bump already taken in this same module.
One moderate-severity finding doesn't justify doubling the migration
risk in the pass meant to be the careful, closing-out one. Revisit
if/when Phase 2 (Module 11, Live Sessions) touches NestJS's WebSocket
gateway anyway, since that's already a NestJS-internals-touching
change.

### Security headers and CSP

- **`apps/api/src/main.ts`**: `helmet` added with a fully closed CSP
  (`script-src`/`style-src`/`font-src` all `'none'`, `useDefaults:
  false` so nothing is silently inherited from helmet's own
  defaults) — deliberate, not an oversight: this API serves no
  application HTML of its own, so there's nothing a permissive
  default would protect. Swagger UI at `/api/docs` gets a second,
  separately relaxed `helmet()` instance scoped to just that path
  (`style-src`/`script-src 'unsafe-inline'`, since Swagger UI renders
  its own inline `<style>`/`<script>`) — verified rendering correctly
  in a real browser with zero console errors.
- **`apps/web/next.config.js`**: this is the actual browser-facing
  surface, so it carries the real CSP — `font-src` allows
  `fonts.gstatic.com` specifically (the design system's `@font-face`
  rules point directly at gstatic woff2 files, no
  `fonts.googleapis.com` stylesheet involved), `connect-src` is scoped
  to `'self'` plus the API origin. Verified in a real logged-in
  browser session (login → dashboard → real API data rendering) with
  zero CSP-refusal console messages, and confirmed `connect-src`
  correctly refuses an arbitrary `fetch()` to an unlisted origin.
  Standard security headers (`X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS) on both apps.

### CORS

`main.ts`'s CORS `origin` previously fell back to `true` (reflect any
origin) whenever `WEB_URL` was unset — safe only because every
configured environment already set it, but a deployment that forgot
to would silently go permissive. `WEB_URL` is now a required env var
(fail-fast at boot), and the fallback is removed.

### Accessibility (WCAG)

- **Focus indicators (2.4.7):** `Input.tsx`'s shared style had
  `outline: 'none'` with no replacement, affecting every text
  input/textarea across all 9 prior modules. Replaced with a
  deliberate `:focus-visible` outline (2px solid brand-primary, 2px
  offset) via a CSS class, not a silent revert to the inconsistent
  native ring.
- **Keyboard operability (2.1.1):** auditing beyond `Input.tsx` found
  two more real violations — `Switch`'s toggle and `Tag`'s remove
  control were both `<span onClick>`, unreachable by keyboard and with
  no accessible name. Rebuilt as real `<button>` elements (`Switch`
  with `role="switch"`/`aria-checked`/`aria-label`). Neither is wired
  into any live page yet, but both are shared components that would
  have shipped this bug the moment they were used.
- **Contrast (1.4.3):** computed via the real WCAG relative-luminance
  formula, not eyeballed. `Badge`'s `onTrack`/`needsSupport`/`atRisk`
  tones measured 3.07:1, 2.80:1, and 4.23:1 against their paired
  backgrounds — all fail the 4.5:1 AA threshold. `--text-secondary`
  (used across six components) measured 4.26:1 on white and 3.92:1 on
  the page background — also failing. Darkened each token to clear
  4.5:1 with real margin (4.98–5.66:1 for the badge tones, 5.01–5.44:1
  for text-secondary), scoped to these specific semantic aliases so
  the underlying numbered color-scale values — used elsewhere for
  borders/icons where the text-contrast rule doesn't apply — are
  untouched.
- Icon-only controls, `alt` text, and form labeling were audited and
  found already correct: zero icon-only buttons exist anywhere in the
  app (grepped), zero `<img>` usage, and every form input already uses
  a real `<label htmlFor>` (not placeholder-only) via the shared
  `FormField` wrapper.
- **Known limitation:** `Switch`'s unchecked-track color (`gray-300`
  on the page background) measures ~1.44:1, below the 3:1 non-text/UI
  boundary contrast guideline (1.4.11). Not fixed in this pass since
  `Switch` isn't wired into any live flow yet — flagged for whoever
  wires it up next, not fixed preemptively for a component nothing
  uses.

### Container build

No Dockerfile existed anywhere in the repo before this module —
`docker-compose.yml` only ever ran local Postgres/Redis infra. Added
`apps/api/Dockerfile` and `apps/web/Dockerfile` (both multi-stage,
Node 24 Alpine); the web image uses Next's `output: "standalone"` for
a self-contained, much smaller production bundle. Verified end-to-end,
not just `docker build` succeeding: ran both as real containers on the
existing docker-compose network, confirmed `/health` resolves
database/redis as connected from inside the API container, then
logged in through a real browser against the containerized web app
talking to the containerized API and reached the authenticated
dashboard.

**Known limitation:** the API image's runtime stage copies the
already-built `node_modules` from the build stage rather than running
a scoped `pnpm install --prod`, because the root workspace's
`postinstall` script fires on every `pnpm install` regardless of
`--prod` and has no `tsc` to run without devDependencies present. This
means devDependencies (eslint, jest, typescript, etc.) ship in the
runtime image — larger than strictly necessary (~297MB compressed vs.
the web image's ~86MB), a documented tradeoff for build reliability,
not an unnoticed gap. A leaner prod-only image (likely via `pnpm
deploy` or a workspace-aware install step that skips the root
postinstall) is reasonable future work.
