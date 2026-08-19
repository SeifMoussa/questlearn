# CI/CD Pipeline

The real stage order from `.github/workflows/ci.yml`, triggered on
every push to `main` and every pull request into it. One job, real
Postgres 17 and Redis 8 service containers (not mocks), sequential
stages.

```mermaid
flowchart TD
    A[Checkout] --> B[Setup Node<br/>from .node-version]
    B --> C[Setup pnpm 11.20.0]
    C --> D[Install dependencies<br/>frozen lockfile]
    D --> E[Build shared packages<br/>config + design-system]
    E --> F[Generate Prisma client]
    F --> G[Lint<br/>every workspace package]
    G --> H[Typecheck<br/>every workspace package]
    H --> I[Apply Prisma migrations<br/>migrate deploy]
    I --> J[Seed database<br/>demo teacher + learner]
    J --> K[Unit + integration tests<br/>Jest, real Postgres/Redis]
    K --> L[Build<br/>API + web, production mode]
    L --> M[Install Chromium<br/>for browser automation]
    M --> N[Start API<br/>background, port 4000]
    N --> O[Start web<br/>background, port 3000]
    O --> P[Wait for both<br/>/health + / respond]
    P --> Q[Browser-driven E2E verification<br/>full real-browser suite against<br/>the running production build]
    Q --> R[Upload E2E run artifacts<br/>always, even on failure]

    subgraph Services["Service containers"]
        PG[(Postgres 17<br/>health-checked)]
        Redis[(Redis 8<br/>health-checked)]
    end
    Services -.-> I
    Services -.-> K
    Services -.-> N
```

A failure at any stage before **Q** stops the pipeline before a
browser is ever launched — lint/typecheck/unit-test failures are
caught cheaply, before the cost of starting both real servers and
running a full browser suite against them.

**Source:** `.github/workflows/ci.yml`, every stage name and order
transcribed directly from the real `steps:` list — nothing
paraphrased or reordered for narrative flow.
