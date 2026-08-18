"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, QuestSummary, listQuests } from "@/lib/api";

/**
 * Teacher: the caller's own quests (builder entry point). Learner:
 * redirects to `/quests/map` — the same `/quests` API path serves both
 * roles (teacher CRUD list vs. learner tenant-wide progress list), so
 * this page only ever renders the teacher view.
 */
export default function QuestsPage() {
  const router = useRouter();
  const { status, accessToken, user } = useAuth();
  const [quests, setQuests] = useState<QuestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "learner") {
      router.replace("/quests/map");
    }
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken || user?.role === "learner") return;
    let cancelled = false;

    listQuests(accessToken)
      .then((result) => {
        if (!cancelled) setQuests(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your quests.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken, user]);

  if (status === "loading" || user?.role === "learner" || (status === "authenticated" && quests === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="quests-loading">Loading your quests…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}>
            Quests
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
            Chain activities and mastery goals into a linear reward path.
          </p>
        </div>
        <Link href="/quests/new">
          <Button variant="primary" size="md">
            New quest
          </Button>
        </Link>
      </div>

      {error && (
        <p role="alert" data-testid="quests-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && quests && quests.length === 0 && (
        <div
          data-testid="quests-empty"
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: 32,
            textAlign: "center",
            maxWidth: 480,
          }}
        >
          <p style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 16 }}>
            You haven&apos;t built a quest yet.
          </p>
          <Link href="/quests/new">
            <Button variant="primary" size="md">
              Build your first quest
            </Button>
          </Link>
        </div>
      )}

      {!error && quests && quests.length > 0 && (
        <div
          data-testid="quests-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
        >
          {quests.map((q) => (
            <Link key={q.id} href={`/quests/${q.id}`} style={{ textDecoration: "none" }} data-testid="quest-card">
              <div
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-card)",
                  padding: 20,
                  height: "100%",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <Badge tone="brand">
                    {q.stepCount} step{q.stepCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p style={{ fontSize: 15, color: "var(--text-primary)", margin: 0, fontWeight: "var(--fw-medium)" }}>
                  {q.title}
                </p>
                {q.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" }}>{q.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
