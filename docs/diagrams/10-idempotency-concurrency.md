# Idempotency & Concurrency

Three genuinely different mechanisms, not one pattern reused five
times. Flattening them into a single generic "claim pattern" box would
misrepresent the two write shapes that don't use a claim at all.

```mermaid
flowchart TD
    Start["A write that must never happen<br/>twice, even under real<br/>concurrent (Promise.all) requests"] --> Q{"What kind of<br/>write is this?"}

    Q -->|"A status TRANSITION<br/>(one row, one time)"| Claim["Atomic claim:<br/>updateMany WHERE status = &lt;prior state&gt;<br/>INSIDE the same transaction as the<br/>work that follows"]
    Claim --> ClaimCheck{"count === 1?"}
    ClaimCheck -->|yes, this call won| DoWork["Do the work<br/>(grade / pin versions),<br/>still inside the transaction"]
    ClaimCheck -->|no, count === 0| NoOp["No-op — return the<br/>already-committed result.<br/>Not an error."]
    DoWork --> Committed1["COMMIT —<br/>Postgres row lock forces a<br/>losing racer to block until<br/>the winner's write is visible"]

    Q -->|"An INSERT gated by a<br/>UNIQUE CONSTRAINT, reached<br/>only from inside one<br/>already-won transaction"| Structural["Rely on the constraint alone —<br/>no pre-check needed, because the<br/>ONLY code path that reaches this<br/>insert is the winning submit() claim"]
    Structural --> Committed2["Insert succeeds exactly once,<br/>structurally — a violation here<br/>would mean the claim pattern<br/>itself broke"]

    Q -->|"An INSERT that TWO<br/>DIFFERENT transactions can<br/>independently reach<br/>(no shared claim to race on)"| Defense["createMany({ skipDuplicates: true })<br/>+ a @@unique constraint —<br/>defense in depth, not fail-loud"]
    Defense --> Committed3["Second racing insert is<br/>silently dropped by Postgres,<br/>not treated as an error"]

    Claim -.->|"used by"| Attempt["Attempt.submit()<br/>Activity.publish()"]
    Structural -.->|"used by"| XpMastery["XpTransaction (unique attemptId)<br/>MasteryEvidence (unique attemptResponseId+conceptId)"]
    Defense -.->|"used by"| BadgeQuest["LearnerBadge (unique learnerId+badgeType)<br/>QuestCompletion (unique questId+learnerId) —<br/>can be independently satisfied by two<br/>different attempts' transactions"]
```

**Why `QuestCompletion` needs defense-in-depth but `XpTransaction`
doesn't:** an `XpTransaction` is scoped to one attempt — only the
single winning claim inside that one attempt's `submit()` transaction
can ever reach the insert, so a unique-constraint violation there
would mean the claim pattern itself is broken (fail-loud, genuinely
unreachable in correct code). A `QuestCompletion`'s last step can
become satisfied by two **different** concurrent attempts — one
completing the activity gate, a racing one independently pushing a
mastery gate over threshold — so there's no single shared claim to
race on, and `skipDuplicates` is the correct, expected-to-sometimes-
trigger mechanism, not a defensive fallback for a bug.

**Source:** doc comments on `XpTransaction`, `MasteryEvidence`,
`LearnerBadge`, and `QuestCompletion` in
`apps/api/prisma/schema.prisma`; proven under real `Promise.all`
concurrency in `apps/api/test/activities/activities.integration.spec.ts`,
`apps/api/test/attempts/attempts.integration.spec.ts`,
`apps/api/test/gamification/gamification.integration.spec.ts`,
`apps/api/test/mastery/mastery.integration.spec.ts`, and
`apps/api/test/quests/quests-concurrency.integration.spec.ts`.
