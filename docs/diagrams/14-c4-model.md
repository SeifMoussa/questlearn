# C4 Model

## Level 1 — System Context

Two actors, one system, **no external systems** — there is no real
email provider integration (`DevEmailService` logs verification/reset
tokens to the server log instead of sending anything; see README's
Module 1 known limitations), no payment processor (§9: no real-money
transactions), and no third-party identity provider (email+password
only).

```mermaid
C4Context
    title QuestLearn — System Context

    Person(teacher, "Teacher", "Builds classes, question banks, activities, and quests; assigns work; reviews reports")
    Person(learner, "Learner", "Joins a class, completes assigned work, tracks XP/badges/mastery")

    System(questlearn, "QuestLearn", "Async, request/response educational gamification platform — quiz → grade → mastery → reward, server-side and idempotent")

    Rel(teacher, questlearn, "Manages content and assignments, views reports", "HTTPS")
    Rel(learner, questlearn, "Joins, attempts, submits, views progress", "HTTPS")
```

## Level 2 — Containers

```mermaid
C4Container
    title QuestLearn — Containers

    Person(teacher, "Teacher")
    Person(learner, "Learner")

    System_Boundary(questlearn, "QuestLearn") {
        Container(web, "Web app", "Next.js (App Router), React 19", "Server-rendered shell + client-side pages; every dynamic route is a client component using useParams()")
        Container(api, "API", "NestJS, TypeScript", "11 feature modules; REST, Bearer JWT + CSRF double-submit; tenant scoping enforced per-service")
        ContainerDb(postgres, "Database", "PostgreSQL 17", "Source of truth — 22 models, tenant_id on every applicable table")
        ContainerDb(redis, "Cache", "Redis 8", "Provisioned, health-checked — not yet backing sessions or rate limits (see 01-system-architecture.md)")
    }

    Rel(teacher, web, "Uses", "HTTPS")
    Rel(learner, web, "Uses", "HTTPS")
    Rel(web, api, "Calls", "REST/JSON, Bearer JWT")
    Rel(api, postgres, "Reads/writes", "Prisma + node-postgres")
    Rel(api, redis, "Health check only", "ioredis")
```

**Source:** `apps/api/src/app.module.ts` (11 modules),
`apps/web/next.config.js` + `package.json` (Next.js 15.5, React 19),
`apps/api/prisma/schema.prisma` (22 models), README's Module 1 known
limitations (`DevEmailService`, no real provider).
