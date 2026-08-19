# DDD Context Map

The bounded contexts as they actually emerged across Modules 1–9, not
a textbook DDD carve-up applied after the fact. Grouped by real
`apps/api/src/*/` module boundaries and confirmed integration style —
service-level dependency injection where it exists, and explicitly
NOT where it doesn't.

```mermaid
graph TB
    subgraph AuthTenancy["Auth & Tenancy"]
        Auth["auth<br/>(User, Tenant, Session,<br/>VerificationToken, PasswordResetToken)"]
        Classes["classes<br/>(Class, RosterEntry —<br/>who belongs to a tenant, and how)"]
    end

    subgraph ContentAuthoring["Content Authoring"]
        Questions["questions<br/>(always-versioned)"]
        Activities["activities<br/>(draft → published, immutable)"]
        Concepts["concepts<br/>(mastery tags)"]
    end

    subgraph Assessment["Assessment"]
        Assignments["assignments"]
        Attempts["attempts<br/>+ scoring.ts (plain functions,<br/>not its own module)"]
    end

    subgraph Engagement["Engagement"]
        Mastery["mastery<br/>(live-computed, no stored state)"]
        Gamification["gamification<br/>(XP, levels, badges)"]
        Quests["quests<br/>(linear, gated)"]
    end

    subgraph Reporting["Reporting (read-side)"]
        Reports["reports<br/>(composes, never owns logic)"]
    end

    Classes -.->|"partnership: redeemJoinCode()<br/>calls AuthService.issueSessionForUser()<br/>directly"| Auth

    Attempts -->|"in-process call,<br/>same transaction"| Mastery
    Attempts -->|"in-process call,<br/>same transaction"| Gamification
    Attempts -->|"in-process call,<br/>same transaction"| Quests
    Gamification -->|"in-process call"| Mastery
    Quests -->|"in-process call"| Mastery

    Reports -->|"reads/composes"| Mastery
    Reports -->|"reads/composes"| Gamification
    Reports -->|"reads/composes"| Quests

    Assessment -.->|"shared schema —<br/>direct Prisma queries against<br/>Activity/ActivityQuestion/QuestionVersion,<br/>NOT a service call"| ContentAuthoring
```

**A real architectural finding, not a simplification:** Assessment
(`assignments`, `attempts`) never imports `ActivitiesModule` or
`QuestionsModule` — confirmed by grepping every module's `imports:`
array. It reaches published-activity content through its own
`PrismaService` queries against the same Postgres schema, not through
`ActivitiesService`/`QuestionsService`. In strict DDD terms, that
makes Content Authoring and Assessment integrate via a **shared
kernel** (one Postgres schema, no anti-corruption layer) rather than a
published API between contexts — a reasonable choice for a monolith
this size, but a real coupling point, not an isolated one.

**Auth and Classes are a genuine partnership, not just "in the same
folder":** `ClassesService.redeemJoinCode()` calls
`AuthService.issueSessionForUser()` directly to hand a brand-new
learner account a real session in one step — the two contexts are
deliberately coupled here, not accidentally.

**Source:** every `apps/api/src/*/*.module.ts` (`imports:` arrays,
confirmed by grep, matching [`05-component-diagram.md`](./05-component-diagram.md));
`apps/api/src/classes/classes.service.ts` (`redeemJoinCode`'s call
into `AuthService`).
