"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarMetricRow, Badge, StatCard } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, ClassMasteryLearner, MasteryState, getClassMastery, masteryGateStatus } from "@/lib/api";

const STATE_LABELS: Record<MasteryState, string> = {
  not_started: "Not started",
  beginning: "Beginning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

const AVATAR_TONE_FOR_STATE: Record<Exclude<MasteryState, "not_started">, "atRisk" | "needsSupport" | "onTrack"> = {
  beginning: "atRisk",
  developing: "needsSupport",
  proficient: "onTrack",
  mastered: "onTrack",
};

/**
 * Teacher class-mastery view (Module 6, §14 screenshot checkpoint):
 * per-concept aggregate across the class, plus a per-learner
 * breakdown, reusing `StatCard`/`AvatarMetricRow` — the same
 * "member + metric" pattern already used elsewhere (class roster,
 * teacher dashboard summary stats) — rather than inventing new
 * components for this one screen.
 */
export default function ClassMasteryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { status, accessToken } = useAuth();

  const [data, setData] = useState<{ learners: ClassMasteryLearner[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getClassMastery(accessToken, classId)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Could not load class mastery.");
        }
      });
  }, [accessToken, classId]);

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

  if (status === "loading" || (status === "authenticated" && data === null && !error && !notFound)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="class-mastery-loading">Loading class mastery…</p>
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
          Class not found
        </h1>
        <p data-testid="class-mastery-not-found" style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This class doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/classes">Back to classes</Link>
      </main>
    );
  }

  const learners = data?.learners ?? [];

  // Per-concept aggregate across the class: average score and a count
  // of learners in each state, computed client-side from the
  // already-fetched per-learner breakdown (no separate endpoint —
  // the same live-computed rows just get grouped a second way here).
  const byConcept = new Map<string, { name: string; scores: number[]; states: MasteryState[] }>();
  for (const learner of learners) {
    for (const concept of learner.concepts) {
      const entry = byConcept.get(concept.conceptId) ?? { name: concept.conceptName, scores: [], states: [] };
      if (concept.score !== null) entry.scores.push(concept.score);
      entry.states.push(concept.state);
      byConcept.set(concept.conceptId, entry);
    }
  }
  const conceptSummaries = Array.from(byConcept.entries()).map(([conceptId, entry]) => {
    const avg = entry.scores.length > 0 ? entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length : 0;
    const masteredCount = entry.states.filter((s) => s === "mastered" || s === "proficient").length;
    return { conceptId, name: entry.name, avgPercent: Math.round(avg * 100), masteredCount, total: entry.states.length };
  });

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/classes/${classId}`}>Back to class</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
        Class mastery
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 520 }}>
        Every concept with mastery evidence from any active learner in this
        class, aggregated class-wide and broken down per learner.
      </p>

      {error && (
        <p role="alert" data-testid="class-mastery-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && conceptSummaries.length === 0 && (
        <div
          data-testid="class-mastery-empty"
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: 32,
            maxWidth: 480,
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            No mastery evidence yet for this class. Evidence appears once
            enrolled learners submit graded attempts on concept-tagged
            questions.
          </p>
        </div>
      )}

      {!error && conceptSummaries.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Class-wide, per concept</h2>
          <div data-testid="class-mastery-stat-cards" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
            {conceptSummaries.map((c) => (
              <StatCard
                key={c.conceptId}
                label={c.name}
                value={`${c.avgPercent}%`}
                delta={`${c.masteredCount}/${c.total} proficient+`}
                deltaDirection="up"
                tone="teal"
              />
            ))}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Per learner</h2>
          <div
            data-testid="class-mastery-learner-list"
            style={{
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              padding: 8,
              maxWidth: 640,
            }}
          >
            {learners
              .filter((l) => l.concepts.length > 0)
              .map((learner) => (
                <div key={learner.learnerId} data-testid="class-mastery-learner-row" style={{ padding: "8px 12px" }}>
                  <AvatarMetricRow
                    name={learner.learnerName}
                    meta={learner.concepts.map((c) => `${c.conceptName}: ${STATE_LABELS[c.state]}`).join(" · ")}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 48, marginTop: -4, marginBottom: 8 }}>
                    {learner.concepts.map((c) => {
                      const gate = masteryGateStatus(c);
                      return (
                        <Badge key={c.conceptId} tone={c.state === "not_started" ? "neutral" : AVATAR_TONE_FOR_STATE[c.state]}>
                          {c.conceptName}: {c.score !== null ? `${Math.round(c.score * 100)}%` : "—"}
                          {gate ? ` (${c.distinctAttemptCount}/${gate.minDistinctAttempts} attempts for ${STATE_LABELS[gate.impliedState]})` : ""}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ))}
            {learners.filter((l) => l.concepts.length > 0).length === 0 && (
              <p style={{ padding: 16, fontSize: 13, color: "var(--text-secondary)" }}>
                No enrolled learner has mastery evidence yet.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
