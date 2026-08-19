# Data Flow / Threat Model

Every boundary below is a real, currently-implemented defense from
[`SECURITY_NOTES.md`](../../SECURITY_NOTES.md) — not a generic STRIDE
checklist applied without checking what actually exists.

```mermaid
flowchart TD
    Browser["Browser"] -->|"HTTPS"| CSP["CSP boundary (apps/web)<br/>script-src/style-src 'self' + 'unsafe-inline',<br/>font-src self + fonts.gstatic.com,<br/>connect-src self + API origin only —<br/>blocks exfil to an unlisted origin"]
    CSP --> Web["Next.js web app"]

    Web -->|"Bearer JWT (access token)<br/>+ cookie (refresh token)"| CORS["CORS boundary (apps/api)<br/>origin = required WEB_URL<br/>(no permissive fallback)"]
    CORS --> RateLimit["Rate-limit boundary<br/>AUTH_THROTTLE: register/login/<br/>forgot-password/join-code<br/>GLOBAL_THROTTLE: everything else<br/>incl. /auth/refresh"]

    RateLimit --> JwtGuard{"JwtAuthGuard:<br/>valid, unexpired JWT?"}
    JwtGuard -->|no| Reject401["401 Unauthorized"]
    JwtGuard -->|yes| CsrfCheck{"Cookie-authenticated<br/>endpoint? (refresh/logout)"}
    CsrfCheck -->|yes| CsrfGuard{"CsrfGuard: cookie token<br/>== header token,<br/>HMAC-valid?"}
    CsrfGuard -->|no| Reject403["403 Forbidden"]
    CsrfGuard -->|yes| Service
    CsrfCheck -->|no| Service["Feature module service"]

    Service --> TenantScope["Tenant-scope boundary<br/>(per-service, not a global guard)<br/>every query: WHERE tenantId = ctx.tenantId<br/>cross-tenant access → 404, never 403"]
    TenantScope --> DB[("Postgres")]

    Service --> AnswerKey["Answer-key boundary<br/>(attempts.service.ts)<br/>correctAnswer/isCorrect/pointsAwarded<br/>stripped until status = submitted"]
    Service --> CsvGuard["CSV formula-injection boundary<br/>(report-formula.ts toCsv)<br/>leading =/+/-/@ → prefixed with '<br/>before RFC 4180 escaping"]
    Service --> Validation["Input validation boundary<br/>class-validator DTOs,<br/>global ValidationPipe"]

    Service --> Log["SecurityLogger<br/>auth events, permission denials,<br/>audited mutations —<br/>never plaintext secrets or answers"]
```

**What's deliberately NOT a boundary here:** there is no tenant-context
middleware or global authorization guard — tenant scoping is enforced
inside each service's own Prisma query, module by module. This is a
real architectural fact, not a simplification for the diagram; see
[`05-component-diagram.md`](./05-component-diagram.md).

**Source:** `SECURITY_NOTES.md` in full; `apps/api/src/auth/guards/`
(`jwt-auth.guard.ts`, `csrf.guard.ts`); `apps/api/src/app.module.ts`
(`ThrottlerGuard`, `AUTH_THROTTLE`/`GLOBAL_THROTTLE`);
`apps/api/src/attempts/attempts.service.ts`
(`loadAttemptDetail`'s answer-key stripping);
`apps/api/src/reports/report-formula.ts` (`toCsv`'s formula-injection
guard); `apps/web/next.config.js` (CSP directives).
