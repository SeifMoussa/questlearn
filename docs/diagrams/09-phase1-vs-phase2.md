# Phase 1 (Built) vs. Phase 2 (Deferred)

The MVP boundary from Master Spec §4, and where the project actually
stands: Modules 0–10 are complete and merged; Module 11 (Live
Sessions) has not been started — no tables, gateways, or APIs for it
exist anywhere in the codebase (confirmed by grep: no WebSocket
gateway, no session-PIN model, no `socket.io`/`ws` dependency).

```mermaid
graph LR
    subgraph Phase1["Phase 1 — MVP (Modules 0–10, built)"]
        direction TB
        P1a["Auth: register, verify,<br/>login, JWT + refresh, CSRF"]
        P1b["Classes: join codes, roster"]
        P1c["Question bank: versioned"]
        P1d["Activities: draft → publish<br/>(immutable, pinned content)"]
        P1e["Assignments & attempts:<br/>async, autosaved, idempotent submit"]
        P1f["Mastery: live-computed,<br/>recency-weighted"]
        P1g["Gamification: XP, levels, badges"]
        P1h["Quests: linear, gated steps"]
        P1i["Reporting: dashboards, CSV"]
        P1j["Hardening: headers, CSP,<br/>a11y, Docker images"]
    end

    subgraph Phase2["Phase 2 — Module 11, Live Sessions (deferred, not started)"]
        direction TB
        P2a["WebSocket gateway"]
        P2b["Session PINs + host lobby"]
        P2c["Reconnection handling"]
        P2d["Real-time scoring"]
        P2e["Host controls"]
        P2f["Redis pub/sub for<br/>horizontal socket scaling"]
    end

    Phase1 -.->|"async, request/response —<br/>the model Phase 2 must not<br/>break, only add alongside"| Phase2
```

**Why Phase 2 waits:** live/synchronous sessions are a genuinely
different complexity class — stateful rooms, reconnection, duplicate
real-time submissions, shared-screen privacy, horizontal socket
scaling — deliberately kept out of the async core so that core could
be finished, tested, and hardened first. The database and module
boundaries were designed to be live-session-ready (every table already
carries `tenantId`; Redis is already provisioned, see
[`01-system-architecture.md`](./01-system-architecture.md)), but
nothing Phase 2-specific has been built.

**Source:** Master Spec §4 ("In scope, Phase 2") and §12 (module
roadmap); confirmed empty by grep across `apps/api/src` and
`package.json` for any WebSocket/session-PIN/gateway code.
