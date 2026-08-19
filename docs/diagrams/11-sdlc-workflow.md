# SDLC / Vertical Slice Workflow

The process every module (0 through 10) actually went through — Master
Spec §13's vertical-slice ordering, combined with the branch/PR/review
discipline §16 requires. Not an idealized process description: this is
the sequence this repository's own commit and PR history reflects,
module after module.

```mermaid
flowchart TD
    A["Plan: read the relevant spec sections<br/>+ the real current code,<br/>propose a concrete approach"] --> B{"User approves<br/>the plan?"}
    B -->|"changes requested"| A
    B -->|approved| C["Database changes<br/>(schema.prisma + migration)"]
    C --> D["Backend domain logic<br/>(pure functions where possible,<br/>unit-testable in isolation)"]
    D --> E["API endpoints<br/>(controller + service,<br/>tenant-scoped, authorization enforced)"]
    E --> F["Minimal Next.js interface<br/>+ seed/fixture data"]
    F --> G["Automated tests:<br/>Jest unit + integration (real Postgres),<br/>Playwright browser flow"]
    G --> H["Independent re-verification:<br/>fresh Docker volume, migrate from zero,<br/>reseed, full suite re-run,<br/>real browser walkthrough of the flow"]
    H --> I{"Re-verification<br/>clean?"}
    I -->|no| D
    I -->|yes| J["Branch → PR →<br/>README checkpoint updated"]
    J --> K{"User review"}
    K -->|changes requested| D
    K -->|approved| L["Merge to main"]
    L --> A
```

**What "independent re-verification" means concretely**, every time:
`docker compose down -v && up` (a genuinely fresh Postgres/Redis
volume, not reused state), migrations applied from zero, the seed
script re-run, the full Jest suite re-run against that fresh database,
and a real browser-driven walkthrough of the module's flow against a
production build (`next build && next start`, never `next dev` — React
StrictMode's dev-only double-invoke behavior can mask real bugs that a
production build won't have).

**Source:** Master Spec §13 (the vertical-slice development section's
9-step list) and §16 (git policy: branch → PR → CI → review → merge,
even solo). Matches the actual commit/PR sequence for every one of
Modules 0–10 in this repository's history.
