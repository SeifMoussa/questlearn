# Testing Report

What's actually been verified, and how — not a coverage aspiration.
Current as of Module 10.2 (Domain Correctness: Mastery Evidence
Gating), following Module 10 (Security, Accessibility, and Production
Hardening).

## Test suites

- **Jest — unit + integration, `apps/api`**: 31 suites, 269 tests, run
  against real Postgres/Redis (via `docker-compose`), not mocks, for
  every integration spec. Covers: auth session lifecycle, classes
  lifecycle + join-code race retry, questions lifecycle + versioning +
  option-id uniqueness, activities lifecycle + publish atomic-claim +
  concurrency proof, the full assignments/attempts lifecycle
  (including the submit idempotency and frozen-content proofs),
  mastery evidence/recalculation (including its own idempotency proof,
  a recency-weighting test — newer evidence carries proportionally
  greater influence than older evidence, not "decay" — and, as of
  Module 10.2, the evidence/distinct-attempt-count gate's boundary
  cases), gamification XP/badge awarding (including its own
  idempotency proof), quest CRUD/gating/reward (including its own
  concurrency proof, reworked in Module 10.2 to stage the "mastered"
  gate across the now-required 3 distinct attempts instead of 1), all
  four reporting endpoints against a hand-checkable fixture (plus CSV
  formula-injection escaping), tenant isolation across every module
  with resources to isolate, and rate limiting (auth + join-code
  redemption + the app-wide default).
- **Jest — `apps/web`**: 3 tests, a render smoke test for the status
  page (loading/connected/degraded states).
- **Playwright — `apps/web/e2e`**: 48 tests across 10 spec files,
  driving real browser journeys against the real running app (not
  component mocks): auth (register → verify → login → dashboard →
  logout), classes (create → roster → rotate), question bank
  (create → edit → preview), activities (build → order → preview →
  publish → immutability), assignments/attempts (assign → join →
  attempt → submit → result), mastery (tag → assign → attempt with
  hint → learner/teacher views), gamification (assign → join →
  attempt → xp/badges), quests (build → steps → learner progress),
  and reporting (dashboard → question analysis → learner report,
  including a real CSV download). Every module's Playwright flow
  passes in CI (§20's Definition of Done requirement).

## §16 "before public pilot" checklist

The spec's pre-pilot checklist, and what's actually been done for
each item — several were already covered by ongoing module-by-module
verification discipline, not new to Module 10:

| Item | Status | Notes |
|---|---|---|
| Dependency audit | **New, Module 10** | `pnpm audit --prod`: 44 → 1 (deferred, documented). See `SECURITY_NOTES.md`. |
| Container build | **New, Module 10** | No Dockerfile existed before this module. Built both, verified end-to-end against real containers on the real docker-compose network — see below. |
| Security scan | **New, Module 10** | The dependency audit above, plus the headers/CSP work — no dedicated SAST/DAST tool run (out of scope for this project's scale; the audit + manual CSP verification is the scan). |
| Accessibility test | **New, Module 10** | Manual keyboard-only walkthrough + computed-contrast verification, not an automated a11y test suite — see `SECURITY_NOTES.md`'s accessibility section for what was found and fixed. |
| Full Playwright suite | **Already covered** | Every module since Module 1 has required its Playwright flow to pass in CI before merge; re-run once more in this module's final verification pass, not new discipline. |
| Migration smoke test (fresh volume) | **Already covered** | Established practice since the Module 9 audit-fixes PR (`docker compose down -v && up`, fresh `prisma migrate deploy`, fresh seed); re-run once more here as this module's final gate. |
| Production build test | **Partially new** | Manually run (`next build && next start`, `nest build && node dist/main.js`) for every prior module's Playwright verification; Module 10 additionally proves the *containerized* production build end-to-end, which is the genuinely new piece. |

## Module 10 verification specifics

Each fix in this module was verified individually before being
committed, not just bundled into one final pass:

- **Dependency overrides** (`pnpm-workspace.yaml`): full
  typecheck/lint/test (269 API + 3 web) re-run clean after applying,
  before the Next.js bump was even started.
- **Next.js 14→15 bump**: isolated in its own commit per the plan's
  risk-sequencing. Full typecheck, lint, production build, full Jest
  suite, and the full 48-test Playwright suite against the production
  build — all clean. `pnpm audit --prod` re-checked: 27 → 1.
- **Helmet + CSP (API)**: verified in a real browser that Swagger UI
  at `/api/docs` renders its full endpoint list with zero console
  errors under the relaxed per-path CSP; curl-verified both CSP
  headers resolve to exactly the directives written, not
  silently-merged helmet defaults. Full API test suite re-run clean.
- **Security headers + CSP (web)**: verified in a real logged-in
  browser session (login → dashboard → classes, real API data
  rendering) with zero CSP-refusal console messages; confirmed
  `connect-src` correctly refuses an arbitrary `fetch()` to an
  unlisted origin. Full 48-test Playwright suite re-run against the
  production build with these headers active.
- **Input focus-visible fix**: verified via
  `getComputedStyle(document.activeElement)` after a real Tab
  keypress in a real browser session, confirming the outline actually
  renders (`rgb(79, 63, 224) solid 2px`, 2px offset), not just that
  the CSS compiles. Also captured as a real before/after screenshot
  pair (`docs/screenshots/10-hardening/`) — not spec-required (§14
  lists no screenshot for Module 10), added anyway as visual evidence
  alongside the computed-style proof.
- **Switch/Tag keyboard fixes + contrast fixes**: contrast values
  computed via the real WCAG relative-luminance formula (not
  eyeballed), then confirmed live via `getComputedStyle` that the new
  token values actually resolve in the rendered app. Full Jest suite,
  design-system lint/typecheck, and the full Playwright suite (which
  exercises the mastery flow's `Badge` status tones) re-run clean.
- **Docker images**: built both, then proved the real end-to-end path
  — ran both as containers on the actual docker-compose network,
  confirmed `/health` resolves database/redis as connected from
  inside the API container, then logged in through a real browser
  against the containerized web app talking to the containerized API
  and reached the authenticated dashboard. Not just "`docker build`
  exited 0."
- **`WEB_URL` required**: full API test suite re-run clean after the
  schema change (verified no test relies on the old optional/
  permissive-CORS-fallback behavior).

## Fresh-environment re-verification (final gate)

Before opening the PR for this module, per the same discipline used
for every prior module:

1. `docker compose down -v && docker compose up -d` — genuinely fresh
   Postgres/Redis volumes, not reused state.
2. `prisma migrate deploy` from zero — all 8 migrations apply clean.
3. `pnpm --filter @questlearn/api seed` — demo data loads clean.
4. Full Jest suite (both apps) against the fresh database.
5. Full Playwright suite (48 tests) against a real production build
   (`next build && next start`, `nest build && node dist/main.js` —
   never `next dev`/`nest start --watch`, since React StrictMode's
   dev-only double-invoke behavior would mask real issues).
6. Both Docker images built and run as real containers, end-to-end
   login proof through the browser.

## Module 10.2 — Mastery Evidence Gating

Domain-correctness fix: mastery state is now additionally gated by a
minimum evidence-row-count and minimum-distinct-attempt-count per
state (score thresholds, the 14-day recency half-life, and the 15%
hint penalty are all unchanged). All gating logic is centralized in
`mastery-formula.ts`/`mastery.service.ts`; `quests.service.ts`,
`quest-formula.ts`, and `gamification.service.ts` required zero
production-code changes, since they only ever consumed the returned
`state` string.

- **`mastery-formula.spec.ts`** — 9 new unit tests: `distinctAttemptCount`
  (unique-attempt counting, empty-evidence case) and `stateForEvidence`
  boundary cases for every state, including the original "two questions
  in one sitting" defect (score 0.925, 2 evidence rows, 1 attempt →
  capped at Developing, not Mastered) and a proof the gate never
  promotes a state above what the score alone justifies.
- **`mastery.integration.spec.ts`** — existing assertions updated to
  the now-correctly-gated states (single evidence row: Proficient →
  Beginning; two evidence rows from one attempt: Mastered →
  Developing), plus two new tests proving a second distinct attempt is
  still insufficient (capped at Proficient) and a third distinct
  attempt genuinely reaches Mastered — both driven through the real
  HTTP submit path, not hand-inserted evidence.
- **`quests.integration.spec.ts`** — the "reaching mastered completes
  step 2" scenario extended from 1 to 3 distinct assignments/attempts
  on the mastery-source concept, with a new intermediate test proving
  2 of the 3 needed attempts is not enough.
- **`quests-concurrency.integration.spec.ts`** — the race proof's
  premise no longer holds as written (a single full-credit response
  can no longer reach Mastered on its own), so it was restaged: two
  sequential pre-race attempts bring the concept to 3 evidence
  rows/2 distinct attempts (short of Mastered), then two further
  attempts are submitted concurrently, each independently computing
  4 evidence rows/3 distinct attempts and crossing the gate — the
  same `QuestCompletion` unique-constraint race this test exists to
  prove, just staged to actually reach the state gate under the new
  rule.
- **`seed.ts`** — extended with a second, narrower published activity
  ("Solar System Mastery Check", 2 questions) and two additional
  submitted assignments/attempts against it, all routed through the
  real `MasteryService.recordEvidenceForAttempt` /
  `GamificationService.awardForAttempt` path (no hand-inserted
  `MasteryEvidence` rows), so the demo learner reaches one genuinely
  Mastered concept (Solar System Basics: 6 evidence rows across 3
  distinct attempts) under the new gate. The Number Theory concept
  used by the existing demo quest is untouched by these additions, so
  that quest's step-2 "unlocked but not yet met" demonstration is
  unaffected.
- **Frontend** — `ConceptMastery` gained `evidenceCount`/
  `distinctAttemptCount`; both the learner `/mastery` page and the
  teacher `/classes/:id/mastery` page now show a short note (e.g.
  "Score 0.98 · 2 of 3 attempts needed for Mastered") whenever the raw
  score would justify a higher state than what's reported, computed
  client-side in `lib/api.ts`'s `masteryGateStatus`.
- **Verification note**: this environment had no reachable Postgres
  (Docker Desktop's engine was not running and could not be started
  headlessly here), so the integration/E2E suites above are updated
  and were reviewed by hand for correctness against the new gate, but
  were not executed in this session. The pure unit suite
  (`mastery-formula.spec.ts`, 26 tests) was run and passes. Run the
  full suite locally with `docker compose up -d && pnpm --filter
  @questlearn/api test && pnpm --filter @questlearn/web test:e2e`
  before merging.

## Known testing gaps

- **No production-scale load testing** — explicitly out of scope per
  §7's NFRs. Reporting's live-computed aggregates are documented as a
  scale assumption in Module 9's README section, not silently
  unbounded.
- **No automated accessibility test suite** (e.g., `axe-core` wired
  into Playwright) — this module's accessibility work was a manual
  audit + fix pass, not automated regression coverage. A reasonable
  follow-up, not required for this module's scope.
- **No dedicated SAST/DAST security scanning tool** — `pnpm audit`
  plus manual CSP/header verification stood in for a "security scan"
  step; a real SAST tool (e.g., Semgrep) in CI is reasonable future
  work.
- Windows-specific: Next.js's standalone build output
  (`apps/web/.next/standalone`) requires elevated privileges to
  produce locally on Windows (symlink creation) — gated behind a
  `DOCKER_BUILD` env flag so it only activates inside the Linux Docker
  build stage, confirmed not to affect local Windows verification
  builds.
