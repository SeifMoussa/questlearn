"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ActivityReport, ApiError, getActivityReport } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_text: "Short text",
  numeric: "Numeric",
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * Question analysis (Module 9, §14 screenshot checkpoint): per-
 * question correct rate, average points awarded, and hint-view rate
 * across every submitted response to this activity, regardless of
 * which class(es) it's assigned to.
 */
export default function ActivityReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activityId = params.id;
  const { status, accessToken } = useAuth();

  const [report, setReport] = useState<ActivityReport | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getActivityReport(accessToken, activityId)
      .then(setReport)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Could not load the question analysis.");
        }
      });
  }, [accessToken, activityId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accessToken) {
      load();
    }
  }, [status, accessToken, load]);

  if (status === "loading" || (status === "authenticated" && report === null && !notFound && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="activity-report-loading">Loading question analysis…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (notFound) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Activity not found
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This activity doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/activities">Back to activities</Link>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          {error ?? "Something went wrong."}
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/activities/${activityId}`}>Back to {report.title}</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
        {report.title} — Question analysis
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 560 }}>
        Correct rate, average points, and hint usage across every submitted response to this activity, across every class it&apos;s assigned to.
      </p>

      {report.questions.length === 0 && (
        <p data-testid="activity-report-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          This activity has no questions yet.
        </p>
      )}

      <div data-testid="activity-report-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
        {report.questions.map((q) => (
          <div
            key={q.activityQuestionId}
            data-testid="activity-report-row"
            style={{
              background: "var(--surface-card)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <Badge tone="neutral">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{q.prompt}</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                {q.submittedResponseCount} response{q.submittedResponseCount === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="brand">{formatPercent(q.correctRate)} correct</Badge>
              <Badge tone="neutral">
                {q.averagePointsAwarded === null ? "—" : q.averagePointsAwarded.toFixed(1)} / {q.points} avg points
              </Badge>
              <Badge tone="neutral">{formatPercent(q.hintViewRate)} used hint</Badge>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
