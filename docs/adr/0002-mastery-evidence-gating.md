# ADR 0002: Mastery Evidence Gating

## Status

Accepted

## Context

Module 6's mastery formula (`mastery-formula.ts`, Master Spec §6.7/A5)
computes a 0-1 score per concept as a recency-weighted average of
per-response evidence, then maps that score straight to a state —
Beginning/Developing/Proficient/Mastered — via fixed cutoffs (0.00 /
0.40 / 0.70 / 0.90). That formula was correct as far as it went, but
its own integration test exposed the defect this ADR fixes: a concept
reached **Mastered** off exactly two evidence rows produced by two
questions inside a **single** attempt (score 0.925, both rows fresh).
Those two rows are correlated, not independent trials — a learner who
gets 3/3 questions right on one topic in one sitting genuinely
performed well, but that is not the same claim as "this learner has
independently demonstrated the concept enough times that the system
should assert Mastered."

The schema shape matters here: `Attempt` has
`@@unique([assignmentId, learnerId])` — one attempt per assignment per
learner, ever, with no retry/reopen mechanism. So "distinct attempts"
and "distinct submitted assignments" are the same fact in this
codebase, and the only way a learner accumulates genuinely independent
evidence is by completing separate assignments that happen to tag the
same concept.

Mastery state also has real downstream consumers with their own
correctness requirements: `QuestsService` gates quest-step completion
on `meetsMasteryThreshold(actualState, requiredState)`, and
`GamificationService` awards the `concept_champion` badge the same
way. Both consume only the `state` string `MasteryService` returns —
neither has independent scoring logic — so fixing the defect
correctly meant fixing it once, centrally, not patching every
consumer.

Module 10.2 is that fix: **Domain Correctness — Mastery Evidence
Gating**.

## Decision

- Mastery state is now gated by evidence quantity in addition to
  score. The score-based cutoffs are unchanged; each state additionally
  requires a minimum evidence-row count **and** a minimum count of
  distinct attempts before it can be reported:

  | State | Min score (unchanged) | Min evidence rows | Min distinct attempts |
  |---|---|---|---|
  | Beginning | 0.00 | 1 | 1 |
  | Developing | 0.40 | 2 | 1 |
  | Proficient | 0.70 | 3 | 2 |
  | Mastered | 0.90 | 4 | 3 |

  These are the final, locked values — chosen to directly fix the
  "two questions in one sitting" defect (Developing's 1-attempt
  minimum still allows an early signal from a single sitting; Proficient
  and Mastered require a *second* and *third* independently-submitted
  assignment respectively) while staying simple enough to explain and
  verify by hand, rather than adopting a full psychometric model for a
  project at this scale.

- **The gate only ever caps a state downward from what the score alone
  would justify — it never promotes a state upward.** Concretely:
  compute the score exactly as before; determine the state the score
  alone would justify via the existing cutoffs; then walk that
  candidate state down (never up) until both the evidence-row-count
  and distinct-attempt-count clear the candidate state's minimums. A
  learner who scores 0.98 from 2 evidence rows in 1 attempt is
  reported as Developing, not Mastered — capped by evidence, not by
  performance.

- **`attemptId` is reached via the existing `MasteryEvidence ->
  AttemptResponse -> Attempt` relation, not a denormalized column.**
  `mastery.service.ts`'s queries add
  `include: { attemptResponse: { select: { attemptId: true } } }`;
  distinct-attempt counts are computed in application code via
  `new Set(...)` over the joined `attemptId`s. Zero schema migration,
  zero backfill.

- **All gating logic is centralized in `mastery-formula.ts` (the pure
  `stateForEvidence`/`distinctAttemptCount` functions) and
  `mastery.service.ts` (the query + aggregation).**
  `ConceptMasteryResult` gains `evidenceCount` and
  `distinctAttemptCount` as additive fields; the API response and
  frontend surface them so a learner capped below their score-implied
  state sees why, rather than it reading as a bug.

- **Recency weighting is described precisely, and is unchanged in
  mechanism.** "Newer evidence has proportionally greater influence
  when combined with older evidence" — not "mastery decays." A
  *static* evidence set's weighted score is provably invariant over
  time: every point's recency weight shrinks at the same 14-day
  half-life, so only the *ratio* between weights changes as new
  evidence arrives, never the score of an idle evidence set sitting
  unread. The score only moves when new evidence is actually recorded.
  `RECENCY_HALF_LIFE_DAYS = 14` and `HINT_PENALTY_MULTIPLIER = 0.85`
  are unchanged.

- **This is a deterministic, transparent product heuristic — not a
  validated psychometric model.** `mastery-formula.ts`'s module
  comment states plainly that this is not a validated Bayesian
  Knowledge Tracing or IRT model. The thresholds above are a defensible,
  explainable design choice sized to this project's scope, not a claim
  of measured predictive accuracy.

- **`quests.service.ts`, `quest-formula.ts`, and
  `gamification.service.ts` receive zero production-code changes.**
  Both already consumed only `MasteryService`'s returned `state`
  string — never independent evidence/score logic of their own — so
  once the state that string represents is correct, quest gating and
  `concept_champion` badge evaluation are correct automatically. Adding
  parallel evidence/attempt-count logic to either module would leak
  the centralization this ADR is built on; if a future feature needs
  the raw counts directly outside `MasteryService`, that is a sign to
  revisit this decision, not a reason to route around it silently.
  Their existing test fixtures (`quests.integration.spec.ts`,
  `quests-concurrency.integration.spec.ts`) were extended to supply
  enough distinct attempts to legitimately clear the new gate — proof
  the fix works through their layer unmodified, not a regression.

### Rejected alternatives

- **Raw evidence-count-only gating (no distinct-attempt requirement).**
  Considered and rejected because it doesn't fix the actual defect: a
  single well-designed assignment with 4+ questions on one concept
  could still produce "Mastered" off one sitting, since every question
  in that attempt would count toward the evidence-row minimum without
  ever requiring the learner to demonstrate the concept again later,
  on separate work. The defect this ADR exists to fix is specifically
  about *independence* of evidence, not merely its *quantity* — a
  count-only gate would raise the bar without closing the actual gap.

- **Denormalizing `attemptId` directly onto `MasteryEvidence`.**
  Considered — it would save one join per mastery read — and rejected.
  `MasteryEvidence` already reaches `Attempt` through the existing
  `attemptResponseId -> AttemptResponse.attemptId` relation; adding a
  second, duplicated path to the same fact would introduce a new
  consistency invariant (the denormalized column and the relation
  could drift) purely to avoid one join, and would require a backfill
  migration for existing data. Given this module ships with zero
  schema migrations, the cost doesn't clear the bar for a change
  motivated only by a hypothetical, unmeasured performance win. If
  profiling ever shows this join is a real bottleneck at production
  data volumes, denormalization can be revisited deliberately, with
  actual numbers — not preemptively.

## Consequences

- `GET /mastery/me` and `GET /classes/:id/mastery` responses gain
  `evidenceCount` and `distinctAttemptCount` per concept — additive,
  non-breaking; no route changes in `mastery.controller.ts`.
- Because mastery state is always recomputed live from
  `MasteryEvidence` (never cached), the stricter rule applies to every
  read immediately on deploy — there is no state migration to run, no
  backfill, no reprocessing job.
- Existing seed data went from showing the demo learner at
  Proficient/Mastered on some concepts off a single attempt to showing
  every concept at Beginning, since one attempt never clears the
  distinct-attempt gate for higher states. `seed.ts` was extended with
  a second published activity ("Solar System Mastery Check") and two
  additional submitted assignments/attempts, all routed through the
  real `MasteryService.recordEvidenceForAttempt` /
  `GamificationService.awardForAttempt` path (never a hand-inserted
  `MasteryEvidence` row), so the demo learner reaches one genuinely
  Mastered concept (Solar System Basics: 6 evidence rows across 3
  distinct attempts) under the new rule.
- `mastery-formula.spec.ts` gained unit tests for `distinctAttemptCount`
  and every `stateForEvidence` boundary, including the original "two
  questions in one sitting" defect case and a proof the gate never
  promotes a state above what the score alone justifies.
  `mastery.integration.spec.ts` was updated to the now-correctly-gated
  states and gained tests proving a second distinct attempt is still
  insufficient and a third genuinely reaches Mastered, driven through
  the real HTTP submit path.
- `quests.integration.spec.ts`'s "reaching mastered completes step 2"
  fixture was extended from 1 to 3 distinct submitted assignments on
  the mastery-source concept. `quests-concurrency.integration.spec.ts`
  — which proves `QuestCompletion`'s uniqueness under true concurrency
  — had its race restaged: two sequential pre-race attempts bring a
  concept to 3 evidence rows / 2 distinct attempts (short of Mastered),
  then two further attempts submitted concurrently each independently
  cross the gate and race to insert `QuestCompletion`, exercising the
  same concurrency proof the old, no-longer-reachable single-attempt
  scenario used to.
- A learner can now legitimately see a high score (e.g. 0.98) while
  still shown as Developing, because independent corroborating
  evidence hasn't accumulated yet. Both the learner `/mastery` page
  and the teacher `/classes/:id/mastery` page surface a short note
  (e.g. "Score 0.98 · 2 of 3 attempts needed for Mastered") whenever
  this gap exists, so it reads as a legible feature rather than a bug.
