# Entity Relationship Diagram

All 22 models in `apps/api/prisma/schema.prisma`, transcribed field by
field. Every non-global table carries `tenantId` (shown on every
entity below except `Tenant` itself) — the multi-tenant scoping the
whole app enforces at the service layer, per Master Spec §6.1 (A4).

Unique constraints beyond the primary key are called out explicitly
where the diagram supports it (`PK`/`UK` markers) because several of
them ARE the idempotency mechanism, not incidental data integrity —
see [`10-idempotency-concurrency.md`](./10-idempotency-concurrency.md).

```mermaid
erDiagram
    TENANT ||--o{ USER : "has"
    TENANT ||--o{ SESSION : "has"
    TENANT ||--o{ VERIFICATION_TOKEN : "has"
    TENANT ||--o{ PASSWORD_RESET_TOKEN : "has"
    TENANT ||--o{ CLASS : "has"
    TENANT ||--o{ QUESTION : "has"
    TENANT ||--o{ ACTIVITY : "has"
    TENANT ||--o{ ASSIGNMENT : "has"
    TENANT ||--o{ ATTEMPT : "has"
    TENANT ||--o{ CONCEPT : "has"
    TENANT ||--o{ QUEST : "has"

    USER ||--o{ SESSION : "owns"
    USER ||--o{ VERIFICATION_TOKEN : "owns"
    USER ||--o{ PASSWORD_RESET_TOKEN : "owns"
    USER ||--o{ CLASS : "teaches (teacherId)"
    USER ||--o{ QUESTION : "authors (teacherId)"
    USER ||--o{ ACTIVITY : "authors (teacherId)"
    USER ||--o{ ASSIGNMENT : "authors (teacherId)"
    USER ||--o{ ATTEMPT : "attempts (learnerId)"
    USER ||--o{ CONCEPT : "authors (teacherId)"
    USER ||--o{ QUEST : "authors (teacherId)"
    USER |o--o{ ROSTER_ENTRY : "links (userId, nullable)"
    USER ||--o{ MASTERY_EVIDENCE : "earns (learnerId)"
    USER ||--o{ XP_TRANSACTION : "earns (learnerId)"
    USER ||--o{ LEARNER_BADGE : "earns (learnerId)"
    USER ||--o{ QUEST_COMPLETION : "earns (learnerId)"

    CLASS ||--o{ ROSTER_ENTRY : "has"
    CLASS ||--o{ ASSIGNMENT : "has"

    QUESTION ||--o{ QUESTION_VERSION : "has (always-versioned)"
    QUESTION ||--o| QUESTION_VERSION : "currentVersion (FK)"
    QUESTION ||--o{ ACTIVITY_QUESTION : "used by"
    QUESTION ||--o{ QUESTION_CONCEPT : "tagged via"

    ACTIVITY ||--o{ ACTIVITY_QUESTION : "has"
    ACTIVITY ||--o{ ASSIGNMENT : "assigned as"
    ACTIVITY |o--o{ QUEST_STEP : "gates (activityId, nullable)"

    ACTIVITY_QUESTION |o--o| QUESTION_VERSION : "pinnedVersion (nullable FK)"
    ACTIVITY_QUESTION ||--o{ ATTEMPT_RESPONSE : "graded via"

    ASSIGNMENT ||--o{ ATTEMPT : "has"

    ATTEMPT ||--o{ ATTEMPT_RESPONSE : "has"
    ATTEMPT |o--o| XP_TRANSACTION : "awards (unique attemptId)"

    ATTEMPT_RESPONSE ||--o{ MASTERY_EVIDENCE : "produces"

    CONCEPT ||--o{ QUESTION_CONCEPT : "tags"
    CONCEPT ||--o{ MASTERY_EVIDENCE : "evidenced for"
    CONCEPT |o--o{ QUEST_STEP : "gates (requiredConceptId, nullable)"

    QUEST ||--o{ QUEST_STEP : "has"
    QUEST ||--o{ QUEST_COMPLETION : "rewards"

    TENANT {
        string id PK
        string name
        enum plan "free"
        datetime createdAt
    }

    USER {
        string id PK
        string tenantId FK
        string email UK "globally unique, not per-tenant"
        string name
        string passwordHash
        enum role "teacher | learner"
        datetime emailVerifiedAt "nullable"
        datetime createdAt
    }

    SESSION {
        string id PK
        string tenantId FK
        string userId FK
        string refreshTokenHash UK "hashed at rest"
        datetime expiresAt
        datetime revokedAt "nullable"
        datetime createdAt
    }

    VERIFICATION_TOKEN {
        string id PK
        string tenantId FK
        string userId FK
        string tokenHash UK "hashed at rest"
        datetime expiresAt
        datetime usedAt "nullable"
        datetime createdAt
    }

    PASSWORD_RESET_TOKEN {
        string id PK
        string tenantId FK
        string userId FK
        string tokenHash UK "hashed at rest"
        datetime expiresAt
        datetime usedAt "nullable"
        datetime createdAt
    }

    CLASS {
        string id PK
        string tenantId FK
        string teacherId FK
        string name
        string joinCode UK
        datetime joinCodeExpiresAt
        datetime createdAt
        datetime archivedAt "nullable, not deleted"
    }

    QUESTION {
        string id PK
        string tenantId FK
        string teacherId FK
        string currentVersionId FK "nullable at type level only"
        datetime createdAt
        datetime archivedAt "nullable, not deleted"
    }

    QUESTION_VERSION {
        string id PK
        string questionId FK
        string tenantId FK "denormalized"
        int versionNumber "UK with questionId"
        enum type "5 locked types"
        string prompt
        int points
        string hint "nullable"
        string explanation "nullable"
        json options "nullable"
        json correctAnswer "shape depends on type"
        datetime createdAt
    }

    ROSTER_ENTRY {
        string id PK
        string tenantId FK
        string classId FK
        string userId FK "nullable — teacher-added placeholder"
        string name
        string email "nullable"
        datetime addedAt
        datetime removedAt "nullable — soft delete"
    }

    ACTIVITY {
        string id PK
        string tenantId FK
        string teacherId FK
        string title
        enum status "draft | published"
        datetime publishedAt "nullable"
        datetime createdAt
        datetime archivedAt "nullable"
    }

    ACTIVITY_QUESTION {
        string id PK
        string tenantId FK
        string activityId FK
        string questionId FK
        string pinnedVersionId FK "nullable — set once, at publish"
        int order
        datetime createdAt
    }

    ASSIGNMENT {
        string id PK
        string tenantId FK
        string teacherId FK
        string classId FK
        string activityId FK "must be a published Activity"
        datetime dueAt
        datetime createdAt
        datetime archivedAt "nullable"
    }

    ATTEMPT {
        string id PK
        string tenantId FK
        string assignmentId FK "UK with learnerId"
        string learnerId FK "UK with assignmentId"
        enum status "in_progress | submitted"
        datetime startedAt
        datetime submittedAt "nullable"
        float score "nullable until graded"
        datetime createdAt
    }

    ATTEMPT_RESPONSE {
        string id PK
        string tenantId FK
        string attemptId FK "UK with activityQuestionId"
        string activityQuestionId FK "UK with attemptId"
        json responseValue
        bool isCorrect "nullable until graded"
        float pointsAwarded "nullable until graded"
        bool hintViewed "default false, never resets"
        datetime createdAt
    }

    CONCEPT {
        string id PK
        string tenantId FK
        string teacherId FK
        string name
        string description "nullable"
        datetime createdAt
        datetime archivedAt "nullable"
    }

    QUESTION_CONCEPT {
        string id PK
        string tenantId FK
        string questionId FK "UK with conceptId"
        string conceptId FK "UK with questionId"
        datetime createdAt
    }

    MASTERY_EVIDENCE {
        string id PK
        string tenantId FK
        string learnerId FK
        string conceptId FK
        string attemptResponseId FK "UK with conceptId"
        float responseScore "frozen at record time"
        bool hintViewed "frozen at record time"
        datetime recordedAt
    }

    XP_TRANSACTION {
        string id PK
        string tenantId FK
        string learnerId FK
        string attemptId FK,UK "one XP row per attempt, structurally"
        int amount
        datetime createdAt
    }

    LEARNER_BADGE {
        string id PK
        string tenantId FK
        string learnerId FK "UK with badgeType"
        enum badgeType "5 badge types, UK with learnerId"
        datetime awardedAt
    }

    QUEST {
        string id PK
        string tenantId FK
        string teacherId FK
        string title
        string description "nullable"
        datetime createdAt
        datetime archivedAt "nullable"
    }

    QUEST_STEP {
        string id PK
        string tenantId FK
        string questId FK "UK with order"
        int order "UK with questId"
        string activityId FK "nullable — activity gate"
        string requiredConceptId FK "nullable — mastery gate"
        enum requiredMasteryState "nullable — beginning..mastered"
        datetime createdAt
    }

    QUEST_COMPLETION {
        string id PK
        string tenantId FK
        string questId FK "UK with learnerId"
        string learnerId FK "UK with questId"
        int xpAwarded "own ledger, separate from XP_TRANSACTION"
        datetime awardedAt
    }
```

**No `mastery_state` table exists** — deliberately. Mastery is always
derived live from `MASTERY_EVIDENCE`; see
[`03-state-machines.md`](./03-state-machines.md).

**Source:** `apps/api/prisma/schema.prisma`, all 22 models, verified
field-by-field against this diagram.
