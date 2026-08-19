# State Machines

Three independent state machines, each with a genuinely different
shape — none of them share a generic "workflow" abstraction, because
their correctness requirements are different.

## Activity: draft → published

One-way, atomically claimed (`ActivitiesService.publish()`), never
reversible. Publishing pins every `ActivityQuestion` row to its
question's exact current version at that moment — this is what lets
`Attempt` grading trust `pinnedVersionId` unconditionally forever
after, even as the underlying `Question` keeps versioning.

```mermaid
stateDiagram-v2
    [*] --> draft: ActivitiesService.create()
    draft --> published: publish()<br/>atomic claim (WHERE status='draft'),<br/>pins every ActivityQuestion.pinnedVersionId
    published --> [*]

    note right of draft
        Content resolves live off each
        question's currentVersionId.
        Structural mutations allowed
        (add/remove/reorder questions,
        rename).
    end note

    note right of published
        Immutable. Structural mutation
        endpoints reject with 400.
        Archiving (visibility only) is
        allowed from either state.
    end note
```

## Attempt: in_progress → submitted

One-way, atomically claimed (`AttemptsService.submit()`) — the exact
transaction detailed in
[`02-submission-pipeline.md`](./02-submission-pipeline.md). A repeat
submit call is a normal idempotent success, not an error.

```mermaid
stateDiagram-v2
    [*] --> in_progress: AttemptsService.start()<br/>(idempotent — repeat calls return the same row)
    in_progress --> submitted: submit()<br/>atomic claim (WHERE status='in_progress')
    submitted --> [*]

    note right of in_progress
        Autosave (PATCH responses)
        allowed. Answer key
        (correctAnswer/isCorrect/
        pointsAwarded) stripped from
        every response.
    end note

    note right of submitted
        Locked — autosave rejects
        with 400. Answer key now
        included in the response.
        score is final.
    end note
```

## Mastery: not_started → beginning → developing → proficient → mastered

Not a stored state at all — there is no `mastery_state` column
anywhere in the schema. Every state shown here is recomputed live, on
every read, from the full history of `MasteryEvidence` rows for a
(learner, concept) pair. The arrows below describe how the computed
state can move as new evidence is recorded or as existing evidence's
recency weight decays — not a stored transition a service ever writes.

```mermaid
stateDiagram-v2
    [*] --> not_started: zero MasteryEvidence rows
    not_started --> beginning: first evidence recorded
    beginning --> developing: recency-weighted score >= 0.40
    developing --> proficient: score >= 0.70
    proficient --> mastered: score >= 0.90

    mastered --> proficient: score decays below 0.90<br/>(recency half-life: 14 days)
    proficient --> developing: score decays below 0.70
    developing --> beginning: score decays below 0.40

    note right of not_started
        Only reachable state with
        zero evidence — never
        derived from a score of 0.
    end note
```

**Source:** `apps/api/src/activities/activities.service.ts`
(`publish()`), `apps/api/src/attempts/attempts.service.ts` (`submit()`),
`apps/api/src/mastery/mastery-formula.ts` (`STATE_CUTOFFS`,
`weightedMasteryScore`, `recencyWeight` — score cutoffs 0 / 0.4 / 0.7 /
0.9, 14-day recency half-life, all read directly from the constants).
