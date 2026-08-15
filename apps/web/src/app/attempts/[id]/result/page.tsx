"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, AttemptDetail, getAttempt } from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "(no answer)";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(no answer)";
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

export default function AttemptResultPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const attemptId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getAttempt(accessToken, attemptId)
      .then((result) => {
        setAttempt(result);
        setLoadState("loaded");
      })
      .catch((err) => {
        setLoadState(err instanceof ApiError && err.status === 404 ? "not-found" : "error");
      });
  }, [accessToken, attemptId]);

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

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="result-loading">Loading result…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (loadState === "not-found") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Attempt not found
        </h1>
        <Link href="/dashboard">Back to dashboard</Link>
      </main>
    );
  }

  if (loadState === "error" || !attempt) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          Something went wrong.
        </p>
      </main>
    );
  }

  const notSubmitted = attempt.status !== "submitted";
  const scorePercent = attempt.score !== null ? Math.round(attempt.score * 100) : null;

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 8 }}>
        Result
      </h1>

      {notSubmitted ? (
        <p data-testid="result-not-submitted" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          This attempt hasn&apos;t been submitted yet.{" "}
          <Link href={`/assignments/${attempt.assignmentId}/attempt`}>Resume it</Link>.
        </p>
      ) : (
        <>
          <p data-testid="result-score" style={{ fontSize: 40, fontWeight: "var(--fw-semibold)", margin: "8px 0 24px" }}>
            {scorePercent}%
          </p>

          <div data-testid="result-question-list" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
            {attempt.questions.map((q, index) => (
              <section
                key={q.activityQuestionId}
                data-testid="result-question"
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-card)",
                  padding: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                    Question {index + 1} — {q.pointsAwarded ?? 0} / {q.points} pt{q.points === 1 ? "" : "s"}
                  </p>
                  <Badge tone={q.isCorrect ? "onTrack" : "atRisk"}>{q.isCorrect ? "Correct" : "Incorrect"}</Badge>
                </div>
                <p style={{ fontSize: 15, marginBottom: 12 }}>{q.prompt}</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>
                  Your answer: {formatAnswer(q.responseValue)}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                  Correct answer: {formatAnswer(q.correctAnswer)}
                </p>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
