"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, ProgressBar } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, ConceptMastery, MasteryState, getMyMastery, masteryGateStatus } from "@/lib/api";

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

function progressToneFor(state: MasteryState): "red" | "amber" | "teal" | "green" {
  if (state === "beginning") return "red";
  if (state === "developing") return "amber";
  if (state === "proficient") return "teal";
  return "green";
}

/**
 * Learner concept view (Module 6, §14 screenshot checkpoint): one card
 * per concept the learner has ANY mastery evidence for. Concepts with
 * zero evidence are never returned by GET /mastery/me, matching the
 * locked "not_started has no row at all" design — so this page has
 * nothing extra to filter, just an empty state when the list is
 * genuinely empty.
 */
export default function MasteryPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();

  const [mastery, setMastery] = useState<ConceptMastery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyMastery(accessToken)
      .then(setMastery)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your mastery."));
  }, [accessToken]);

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

  if (status === "loading" || (status === "authenticated" && mastery === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="mastery-loading">Loading your mastery…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
        Your mastery
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 480 }}>
        Mastery is separate from your grades — it reflects how consistently
        and how recently you&apos;ve answered questions tagged with each
        concept correctly.
      </p>

      {error && (
        <p role="alert" data-testid="mastery-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && mastery && mastery.length === 0 && (
        <div
          data-testid="mastery-empty"
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: 32,
            maxWidth: 480,
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            No mastery evidence yet. Complete an assignment with concept-tagged
            questions to start building your mastery profile.
          </p>
        </div>
      )}

      {!error && mastery && mastery.length > 0 && (
        <div
          data-testid="mastery-concept-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, maxWidth: 800 }}
        >
          {mastery.map((concept) => {
            const gate = masteryGateStatus(concept);
            return (
              <div
                key={concept.conceptId}
                data-testid="mastery-concept-card"
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-card)",
                  padding: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: 0, color: "var(--text-primary)" }}>
                    {concept.conceptName}
                  </h2>
                  <span data-testid="mastery-state-badge">
                    <Badge tone={STATE_TONES[concept.state]}>{STATE_LABELS[concept.state]}</Badge>
                  </span>
                </div>
                <ProgressBar
                  value={concept.score !== null ? Math.round(concept.score * 100) : 0}
                  tone={progressToneFor(concept.state)}
                />
                {gate && (
                  <p data-testid="mastery-gate-note" style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0" }}>
                    Score {concept.score !== null ? concept.score.toFixed(2) : "—"} · {concept.distinctAttemptCount} of{" "}
                    {gate.minDistinctAttempts} attempts needed for {STATE_LABELS[gate.impliedState]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
