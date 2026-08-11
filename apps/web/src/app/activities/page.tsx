"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, ActivitySummary, listActivities } from "@/lib/api";

export default function ActivitiesPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;

    listActivities(accessToken)
      .then((result) => {
        if (!cancelled) setActivities(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your activities.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  if (status === "loading" || (status === "authenticated" && activities === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="activities-loading">Loading your activities…</p>
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
            Activities
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
            Build quizzes from your question bank and publish them when ready.
          </p>
        </div>
        <Link href="/activities/new">
          <Button variant="primary" size="md">
            New activity
          </Button>
        </Link>
      </div>

      {error && (
        <p role="alert" data-testid="activities-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && activities && activities.length === 0 && (
        <div
          data-testid="activities-empty"
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
            You haven&apos;t built an activity yet.
          </p>
          <Link href="/activities/new">
            <Button variant="primary" size="md">
              Build your first activity
            </Button>
          </Link>
        </div>
      )}

      {!error && activities && activities.length > 0 && (
        <div
          data-testid="activities-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
        >
          {activities.map((a) => (
            <Link key={a.id} href={`/activities/${a.id}`} style={{ textDecoration: "none" }} data-testid="activity-card">
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
                  <Badge tone={a.status === "published" ? "onTrack" : "neutral"}>
                    {a.status === "published" ? "Published" : "Draft"}
                  </Badge>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.questionCount} question{a.questionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p style={{ fontSize: 15, color: "var(--text-primary)", margin: 0, fontWeight: "var(--fw-medium)" }}>
                  {a.title}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
