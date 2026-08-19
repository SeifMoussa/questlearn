# Planning Sketches — Pre-Implementation Reference Only

These 10 images are the author's own architecture sketches, drawn
**before any code existed**, during initial planning. They are not
technical documentation of QuestLearn as built — they're kept here as
a historical reference for the visual language later applied to the
real diagrams, and as an honest record of how the design evolved
during implementation.

**For what QuestLearn actually is, use [`docs/diagrams/`](../) —
the 15 as-built diagrams**, generated from the real, final codebase
(schema, source, tests, CI config) after all 10 modules were built and
merged, each with a citation to the specific file(s) it's derived
from.

## What changed between the sketch and the build, and why

Several things these sketches show were never built, or were built
differently, for reasons documented in each relevant module's README
section and in [`SECURITY_NOTES.md`](../../../SECURITY_NOTES.md):

- **No BullMQ background worker.** The sketches (01, 02, 09) show a
  BullMQ queue processing mastery recalculation, badge rules, and
  notification dispatch asynchronously. Modules 6–8 shipped this
  logic synchronously instead — mastery evidence, XP/badge awards, and
  quest-progress evaluation all run inside the *same* database
  transaction as attempt grading (`AttemptsService.submit()`), not as
  queued jobs. See
  [`02-submission-pipeline.md`](../02-submission-pipeline.md).
- **No event bus / outbox pattern.** Sketch 03 shows the submission
  flow emitting an `AttemptGraded` domain event to an outbox, consumed
  asynchronously by downstream services. The real flow calls
  `MasteryService`, `GamificationService`, and `QuestsService`
  directly, in-process, inside the one transaction — no event, no
  outbox table, no consumer lag to reason about.
- **No global tenancy/authorization guard layer.** Sketches 01, 02,
  and 04 show a dedicated "Tenancy Context Resolver" and
  "Authorization Guard" as request-pipeline stages ahead of every
  feature module. The real app enforces tenant scoping per-service,
  per-query (`WHERE tenantId = ctx.tenantId`) — there is no shared
  middleware or guard component doing this centrally. See
  [`13-data-flow-threat-model.md`](../13-data-flow-threat-model.md)
  and [`05-component-diagram.md`](../05-component-diagram.md).
- **No notifications or audit modules.** Sketches 01, 02, and 10 show
  both as first-class feature modules. Neither was built — no
  trigger call, no table, no UI hook for either exists anywhere in the
  codebase. Both are FR#11/FR#12 in the master spec, explicitly
  deferred, documented in Module 9's README section.
- **No manual score override or manual badge award.** Sketch 07's
  teacher use cases include "Override Score" and "Award Manual Badge."
  Neither endpoint was built — `GamificationController` exposes only a
  read-only profile endpoint, and no grade-override path exists in
  `AttemptsController`.
- **Redis's actual role is narrower than planned.** The sketches show
  Redis backing session cache, rate limiting, and the BullMQ queue.
  The BullMQ queue never existed to back. Rate limiting uses NestJS's
  in-memory default store, not a Redis adapter. The only place Redis
  is actually used in the API is the `/health` connectivity check.

None of this is a regression from the plan — it's what independent,
module-by-module engineering discipline actually produced: several of
these cuts (the event bus, the background worker, the global guard
layer) were deliberately not built because the simpler synchronous
alternative was sufficient, testable, and shipped with real
concurrency proofs, and adding the more complex version would have
been speculative infrastructure for a problem that never materialized
at this scale.
