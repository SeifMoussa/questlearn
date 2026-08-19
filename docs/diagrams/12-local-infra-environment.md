# Local Infrastructure & Environment

Two distinct things, not one: `docker-compose.yml` runs *local
development infrastructure only* (Postgres + Redis) — it has never run
the app itself. The two application Dockerfiles, added in Module 10,
are a separate, later addition for production images.

```mermaid
graph TB
    subgraph Local["Local development (docker-compose.yml)"]
        Dev["pnpm dev:api / dev:web<br/>(nest start --watch / next dev)<br/>runs on the HOST, not in a container"]
        PG["Postgres 17-alpine<br/>questlearn-postgres<br/>health-checked, volume-persisted"]
        RD["Redis 8-alpine<br/>questlearn-redis<br/>health-checked, volume-persisted"]
        Dev -->|"DATABASE_URL"| PG
        Dev -->|"REDIS_URL<br/>(health-check only —<br/>see 01-system-architecture.md)"| RD
    end

    subgraph Prod["Production images (Module 10)"]
        direction TB
        ApiBuild["apps/api/Dockerfile<br/>multi-stage: build stage (full deps,<br/>prisma generate, nest build)<br/>→ runner stage (copies built<br/>node_modules + dist)"]
        WebBuild["apps/web/Dockerfile<br/>multi-stage: build stage<br/>(next build, output: standalone)<br/>→ runner stage (trimmed<br/>self-contained server.js)"]
    end

    ApiImage["questlearn-api image<br/>node dist/main.js"]
    WebImage["questlearn-web image<br/>node apps/web/server.js"]

    ApiBuild --> ApiImage
    WebBuild --> WebImage

    ApiImage -->|"DATABASE_URL, REDIS_URL,<br/>JWT_SECRET, CSRF_SECRET,<br/>WEB_URL (required)"| PG
    ApiImage -.-> RD
    WebImage -->|"NEXT_PUBLIC_API_URL<br/>(build-time, inlined —<br/>not a runtime env var)"| ApiImage
```

**Why the API image is larger than the web image (~297MB vs. ~86MB
compressed):** the API runner stage copies the build stage's full
`node_modules` (devDependencies included) rather than a scoped
production-only install — the workspace root's `postinstall` script
runs on every `pnpm install` regardless of `--prod` and has no `tsc`
to build with once devDependencies are stripped. A documented
tradeoff for build reliability, not an oversight (see
`SECURITY_NOTES.md`). The web image avoids this entirely by using
Next's `output: "standalone"`, which traces the real runtime
dependency graph into a minimal, self-contained bundle.

**Source:** `docker-compose.yml`, `apps/api/Dockerfile`,
`apps/web/Dockerfile`, `apps/web/next.config.js` (`output:
"standalone"`, gated behind a `DOCKER_BUILD` flag — see that file's
own comments for why).
