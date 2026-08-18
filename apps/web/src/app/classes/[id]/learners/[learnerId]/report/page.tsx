"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, StatCard } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, LearnerReport, MasteryState, getLearnerReport } from "@/lib/api";

const STATE_LABELS: Record<MasteryState, string> = {
  not_started: "Not started",
  beginning: "Beginning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

const STATE_TONES: Record<MasteryState, "neutral" | "onTrack" | "needsSupport" | "atRisk"> = {
  not_started: "neutral",
  beginning: "atRisk",
  developing: "needsSupport",
  proficient: "onTrack",
  mastered: "onTrack",
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * Learner report (Module 9, §14 screenshot checkpoint): a teacher's
 * full-picture view of one student — attempt history, mastery,
 * gamification profile, and quest progress — composed almost entirely
 * from Modules 5-8's existing service methods rather than re-deriving
 * anything. `classId` in the URL is authorization-only (see
 * ReportsService.getLearnerReport); the content itself spans every
 * class this teacher teaches the learner in.
 */
export default function LearnerReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string; learnerId: string }>();
  const classId = params.id;
  const learnerId = params.learnerId;
  const { status, accessToken } = useAuth();

  const [report, setReport] = useState<LearnerReport | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getLearnerReport(accessToken, classId, learnerId)
      .then(setReport)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Could not load the learner report.");
        }
      });
  }, [accessToken, classId, learnerId]);

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
        <p data-testid="learner-report-loading">Loading learner report…</p>
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
          Learner not found
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This learner isn&apos;t on this class&apos;s roster, or this class isn&apos;t one of yours.
        </p>
        <Link href={`/classes/${classId}/report`}>Back to class report</Link>
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

  const levelPercent =
    report.gamification.xpForNextLevel > 0
      ? Math.round((report.gamification.xpIntoLevel / report.gamification.xpForNextLevel) * 100)
      : 100;

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/classes/${classId}/report`}>Back to class report</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: "0 0 4px" }}>
        {report.learner.name}
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>{report.learner.email}</p>

      <section data-testid="learner-report-gamification" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Total XP" value={report.gamification.totalXp} tone="indigo" />
        <StatCard label="Level" value={report.gamification.level} tone="teal" />
        <StatCard label="Level progress" value={`${levelPercent}%`} tone="amber" />
        <StatCard label="Badges earned" value={report.gamification.badges.length} tone="indigo" />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>
          Attempts ({report.attempts.length})
        </h2>

        {report.attempts.length === 0 && (
          <p data-testid="learner-report-attempts-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No attempts yet.
          </p>
        )}

        <div data-testid="learner-report-attempts-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
          {report.attempts.map((a) => (
            <div
              key={a.assignmentId}
              data-testid="learner-report-attempt-row"
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: "var(--fw-medium)", color: "var(--text-primary)", margin: 0 }}>
                  {a.activityTitle}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>
                  {a.className} · Due {new Date(a.dueAt).toLocaleDateString()}
                </p>
              </div>
              <Badge tone={a.status === "submitted" ? "onTrack" : "needsSupport"}>
                {a.status === "submitted" ? formatPercent(a.score) : "In progress"}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Mastery</h2>

        {report.mastery.length === 0 && (
          <p data-testid="learner-report-mastery-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No mastery evidence recorded yet.
          </p>
        )}

        <div data-testid="learner-report-mastery-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, maxWidth: 720 }}>
          {report.mastery.map((c) => (
            <div
              key={c.conceptId}
              data-testid="learner-report-mastery-card"
              style={{ background: "var(--surface-card)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 14 }}
            >
              <p style={{ fontSize: 13, fontWeight: "var(--fw-medium)", color: "var(--text-primary)", margin: "0 0 6px" }}>{c.conceptName}</p>
              <Badge tone={STATE_TONES[c.state]}>{STATE_LABELS[c.state]}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Quests</h2>

        {report.quests.length === 0 && (
          <p data-testid="learner-report-quests-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No quests available yet.
          </p>
        )}

        <div data-testid="learner-report-quests-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          {report.quests.map((q) => (
            <div
              key={q.id}
              data-testid="learner-report-quest-row"
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{q.title}</span>
              <Badge tone={q.complete ? "onTrack" : "neutral"}>
                {q.complete ? `Complete — +${q.xpAwarded} XP` : `${q.unlockedStepCount}/${q.totalSteps} unlocked`}
              </Badge>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
