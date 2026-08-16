"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, StatCard } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { LearnerAssignment, listMyAssignments } from "@/lib/api";

function statusLabel(assignment: LearnerAssignment): { text: string; tone: "neutral" | "onTrack" | "needsSupport" } {
  if (!assignment.attempt) return { text: "Not started", tone: "neutral" };
  if (assignment.attempt.status === "submitted") return { text: "Submitted", tone: "onTrack" };
  return { text: "In progress", tone: "needsSupport" };
}

function LearnerDashboard({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
  const { accessToken } = useAuth();
  const [assignments, setAssignments] = useState<LearnerAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listMyAssignments(accessToken)
      .then((result) => {
        if (!cancelled) setAssignments(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your assignments.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1
            data-testid="dashboard-greeting"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}
          >
            Welcome back, {name}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>{email}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/mastery">
            <Button variant="secondary" size="md">
              My mastery
            </Button>
          </Link>
          <Link href="/join">
            <Button variant="secondary" size="md">
              Join another class
            </Button>
          </Link>
          <Button variant="secondary" size="md" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Your assignments</h2>

      {error && (
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      {assignments === null && !error && (
        <p data-testid="learner-assignments-loading" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Loading your assignments…
        </p>
      )}

      {assignments !== null && assignments.length === 0 && (
        <p data-testid="learner-assignments-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          No assignments yet. Once a teacher assigns something to one of your
          classes, it will show up here.
        </p>
      )}

      {assignments !== null && assignments.length > 0 && (
        <ul data-testid="learner-assignments-list" style={{ listStyle: "none", padding: 0, maxWidth: 640 }}>
          {assignments.map((a) => {
            const { text, tone } = statusLabel(a);
            const href =
              a.attempt?.status === "submitted"
                ? `/attempts/${a.attempt.id}/result`
                : `/assignments/${a.id}/attempt`;
            return (
              <li key={a.id} data-testid="learner-assignment-row" style={{ marginBottom: 10 }}>
                <Link
                  href={href}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                    color: "inherit",
                    background: "var(--surface-card)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-card)",
                    padding: 16,
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>{a.activity.title}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                      {a.class.name} · Due {new Date(a.dueAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {a.attempt?.status === "submitted" && a.attempt.score !== null && (
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {Math.round(a.attempt.score * 100)}%
                      </span>
                    )}
                    <Badge tone={tone}>{text}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="dashboard-loading">Loading your dashboard…</p>
      </main>
    );
  }

  if (status !== "authenticated" || !user) {
    // Redirect effect above is already in flight; render nothing.
    return null;
  }

  function onLogout() {
    void logout().then(() => router.push("/login"));
  }

  if (user.role === "learner") {
    return <LearnerDashboard name={user.name} email={user.email} onLogout={onLogout} />;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1
            data-testid="dashboard-greeting"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}
          >
            Welcome back, {user.name}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>{user.email}</p>
        </div>
        <Button variant="secondary" size="md" onClick={onLogout}>
          Log out
        </Button>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Quests" value="0" />
        <StatCard label="Students" value="0" />
        <StatCard label="Mastery" value="—" />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/classes">
          <Button variant="secondary" size="md">
            Manage classes
          </Button>
        </Link>
        <Link href="/questions">
          <Button variant="secondary" size="md">
            Question bank
          </Button>
        </Link>
        <Link href="/activities">
          <Button variant="secondary" size="md">
            Activities
          </Button>
        </Link>
        <Link href="/concepts">
          <Button variant="secondary" size="md">
            Concepts
          </Button>
        </Link>
      </div>

      <p style={{ marginTop: 32, color: "var(--text-secondary)", fontSize: 14, maxWidth: 480 }}>
        Quests and analytics land in a later module. Classes, the question
        bank, and activities are managed on their own pages — assign a
        published activity to a class from that activity&apos;s page.
      </p>
    </main>
  );
}
