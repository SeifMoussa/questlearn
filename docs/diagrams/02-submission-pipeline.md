# Submission Pipeline

The correctness-critical flow in the whole system: `POST
/attempts/:id/submit`, handled by `AttemptsService.submit()`. Every
step from the atomic claim onward runs inside one Postgres transaction
— not a chain of separate calls — which is what makes the whole
pipeline safe to re-run under a genuine concurrent double-submit, not
just a sequential retry.

```mermaid
sequenceDiagram
    actor Learner
    participant API as AttemptsController
    participant Svc as AttemptsService.submit()
    participant DB as Postgres (one transaction)
    participant Scoring as scoreQuestion / overallScore
    participant Mastery as MasteryService
    participant Gamification as GamificationService
    participant Quests as QuestsService

    Learner->>API: POST /attempts/:id/submit
    API->>Svc: submit(ctx, attemptId)
    Svc->>DB: findFirst Attempt (tenant + learner scoped)
    DB-->>Svc: attempt row

    Svc->>DB: BEGIN transaction
    Svc->>DB: updateMany Attempt<br/>WHERE id=? AND status='in_progress'<br/>SET status='submitted'

    alt claim.count === 0 (already submitted, or lost the race)
        DB-->>Svc: count = 0
        Note over Svc: skip grading entirely —<br/>no re-grade, no error
    else claim.count === 1 (this call won)
        DB-->>Svc: count = 1
        Svc->>DB: load ActivityQuestions (pinnedVersion) + AttemptResponses
        Svc->>Scoring: scoreQuestion() per response
        Scoring-->>Svc: isCorrect, pointsAwarded per question
        Svc->>DB: update each AttemptResponse
        Svc->>Scoring: overallScore(graded)
        Svc->>DB: update Attempt.score

        Svc->>Mastery: recordEvidenceForAttempt(tx, ctx, graded)
        Mastery->>DB: insert MasteryEvidence rows<br/>(same transaction)
        Mastery-->>Svc: touchedConceptIds

        Svc->>Gamification: awardForAttempt(tx, ctx, {attemptId, score, ...})
        Gamification->>DB: insert XpTransaction<br/>award LearnerBadge rows<br/>(same transaction)

        Svc->>Quests: evaluateQuestProgressForAttempt(tx, ctx, {activityId, touchedConceptIds})
        Quests->>DB: insert QuestCompletion rows if gates satisfied<br/>(same transaction)
    end

    Svc->>DB: COMMIT transaction
    DB-->>Svc: transaction result (won: true/false)

    opt won === true
        Svc->>Svc: SecurityLogger.log("attempt_submitted")
    end

    Svc->>DB: loadAttemptDetail (fresh read, outside transaction)
    DB-->>Svc: full graded attempt
    Svc-->>API: attempt detail (score, correctAnswer now visible)
    API-->>Learner: 200 OK
```

**Why the claim has to be inside the transaction, not before it:** if
the `updateMany` claim and the grading writes were two separate round
trips, a losing concurrent request could read the attempt back after
the winner's claim commits but before the winner's grading commits —
observing `status: "submitted"` with a still-null `score`. Doing both
inside one transaction means Postgres's row lock on the `Attempt` row
forces a losing `updateMany` to block until the winner's transaction
fully commits, so by the time a loser sees `count === 0`, the winner's
grade is already guaranteed visible.

**Source:** `apps/api/src/attempts/attempts.service.ts:266-389`
(`AttemptsService.submit()`), matched to this diagram step by step.
Proven under real concurrency (`Promise.all`, not just sequential
duplicate calls) in
`apps/api/test/attempts/attempts.integration.spec.ts`.
