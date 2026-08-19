# Security & Authentication Sequence

Register → login → refresh rotation → CSRF-checked cookie endpoints,
matching `AuthService` and the two auth guards exactly.

```mermaid
sequenceDiagram
    actor User
    participant API as AuthController
    participant Svc as AuthService
    participant Argon2 as argon2 (argon2id)
    participant DB as Postgres
    participant JWT as JwtService

    rect rgb(240, 240, 250)
    Note over User, DB: Register
    User->>API: POST /auth/register
    API->>Svc: register(dto)
    Svc->>DB: findUnique User by email
    alt email already exists
        DB-->>Svc: existing row
        Svc-->>API: 409 ConflictException
    else new email
        Svc->>Argon2: hash(password, ARGON2_OPTIONS)
        Note right of Argon2: argon2id, memoryCost 19456,<br/>timeCost 2, parallelism 1
        Argon2-->>Svc: passwordHash
        Svc->>DB: transaction: create Tenant + User (role=teacher)
        Svc->>DB: create VerificationToken (hashed, 1h TTL)
        Svc->>User: DevEmailService logs verification token
        Svc-->>API: 200 "check your email"
    end
    end

    rect rgb(240, 250, 240)
    Note over User, DB: Login
    User->>API: POST /auth/login
    API->>Svc: login(dto)
    Svc->>DB: findUnique User by email
    alt no account
        Svc-->>API: 401 "Invalid email or password"<br/>(generic — no account-existence leak)
    else account found
        Svc->>Argon2: verify(passwordHash, password)
        alt wrong password
            Svc-->>API: 401 "Invalid email or password"<br/>(identical generic message)
        else correct password, email not verified
            Svc-->>API: 403 "Please verify your email"
        else correct password, verified
            Svc->>JWT: signAsync(access token, 15 min TTL)
            Svc->>DB: create Session<br/>(refreshTokenHash, 7-day TTL)
            Svc-->>API: 200 {accessToken, refreshToken, user}
        end
    end
    end

    rect rgb(250, 245, 235)
    Note over User, DB: Refresh (rotation)
    User->>API: POST /auth/refresh<br/>(refresh token cookie + X-CSRF-Token header)
    API->>API: CsrfGuard: cookie csrf_token === header X-CSRF-Token?<br/>HMAC signature valid (CSRF_SECRET)?
    alt CSRF check fails
        API-->>User: 403 ForbiddenException
    else CSRF check passes
        API->>Svc: refresh(refreshToken)
        Svc->>DB: findUnique Session by refreshTokenHash
        alt session revoked, expired, or not found
            Svc-->>API: 401 "Invalid or expired refresh token"
        else valid session
            Svc->>DB: update Session SET revokedAt=now()<br/>(old token now a dead end, even if stolen)
            Svc->>JWT: sign new access token
            Svc->>DB: create new Session (new refresh token)
            Svc-->>API: 200 new {accessToken, refreshToken}
        end
    end
    end
```

**Tenant isolation is not shown as a separate guard step above**
because there isn't one — it's enforced per-service, per-query. See
[`13-data-flow-threat-model.md`](./13-data-flow-threat-model.md) for
how a request reaches a tenant-scoped resource after authentication.

**Source:** `apps/api/src/auth/auth.service.ts` (`register`, `login`,
`issueSession`, `refresh`), `apps/api/src/auth/guards/csrf.guard.ts`,
`apps/api/src/auth/csrf.util.ts` (HMAC double-submit), all constants
(`ACCESS_TOKEN_TTL_SECONDS = 900`, `REFRESH_TOKEN_TTL_MS = 7 days`,
`ARGON2_OPTIONS`) read directly from source, not approximated.
