"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@questlearn/design-system";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { useAuth } from "@/lib/auth-context";
import { ApiError, AttemptDetail, autosaveResponse, markHintViewed, startAttempt, submitAttempt } from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

/**
 * The activity player: `start` is called every visit (idempotent —
 * see apps/api's AttemptsService.start), all questions render on one
 * page (not paginated, a documented known limitation), and every
 * change autosaves immediately. If the attempt is already submitted
 * when this page loads, it redirects straight to the result page
 * instead of rendering an editable form the API would reject anyway.
 */
export default function AttemptPlayerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [hintsViewed, setHintsViewed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, "idle" | "saving" | "saved">>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);

  const load = useCallback(() => {
    if (!accessToken || startedRef.current) return;
    startedRef.current = true;
    startAttempt(accessToken, assignmentId)
      .then((result) => {
        if (result.status === "submitted") {
          router.replace(`/attempts/${result.id}/result`);
          return;
        }
        setAttempt(result);
        const initial: Record<string, unknown> = {};
        const initialHints: Record<string, boolean> = {};
        for (const q of result.questions) {
          initial[q.activityQuestionId] = q.responseValue;
          initialHints[q.activityQuestionId] = q.hintViewed;
        }
        setAnswers(initial);
        setHintsViewed(initialHints);
        setLoadState("loaded");
      })
      .catch((err) => {
        setLoadState(err instanceof ApiError && err.status === 404 ? "not-found" : "error");
      });
  }, [accessToken, assignmentId, router]);

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

  function onAnswerChange(activityQuestionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [activityQuestionId]: value }));
    if (!accessToken || !attempt) return;
    setSaving((prev) => ({ ...prev, [activityQuestionId]: "saving" }));
    autosaveResponse(accessToken, attempt.id, activityQuestionId, value)
      .then(() => setSaving((prev) => ({ ...prev, [activityQuestionId]: "saved" })))
      .catch(() => setSaving((prev) => ({ ...prev, [activityQuestionId]: "idle" })));
  }

  function onRevealHint(activityQuestionId: string) {
    if (!accessToken || !attempt || hintsViewed[activityQuestionId]) return;
    // Optimistic — flips immediately so the hint text shows without
    // waiting on the round trip; never re-fires once already true.
    setHintsViewed((prev) => ({ ...prev, [activityQuestionId]: true }));
    markHintViewed(accessToken, attempt.id, activityQuestionId).catch(() => {
      // The reveal already happened client-side; a failed persist call
      // just means the server won't have hintViewed recorded for
      // mastery purposes on this response, not a broken UI.
    });
  }

  async function onSubmit() {
    if (!accessToken || !attempt) return;
    if (!confirm("Submit this attempt? You won't be able to change your answers afterward.")) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitAttempt(accessToken, attempt.id);
      router.push(`/attempts/${result.id}/result`);
    } catch (error) {
      setSubmitting(false);
      setSubmitError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="attempt-loading">Loading your attempt…</p>
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
          Assignment not found
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This assignment doesn&apos;t exist, or you&apos;re not enrolled in its class.
        </p>
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

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", marginBottom: 24 }}>
        Attempt
      </h1>

      {submitError && (
        <p role="alert" data-testid="submit-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {submitError}
        </p>
      )}

      <div data-testid="attempt-question-list" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 560 }}>
        {attempt.questions.map((q, index) => (
          <section
            key={q.activityQuestionId}
            data-testid="attempt-question"
            style={{
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              padding: 20,
            }}
          >
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              Question {index + 1} of {attempt.questions.length} — {q.points} pt{q.points === 1 ? "" : "s"}
            </p>
            <QuestionRenderer
              question={q}
              value={answers[q.activityQuestionId]}
              onChange={(value) => onAnswerChange(q.activityQuestionId, value)}
              hintViewed={hintsViewed[q.activityQuestionId] ?? false}
              onRevealHint={() => onRevealHint(q.activityQuestionId)}
            />
            {saving[q.activityQuestionId] === "saved" && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>Saved</p>
            )}
          </section>
        ))}
      </div>

      <div style={{ marginTop: 32 }}>
        <Button variant="primary" size="lg" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </main>
  );
}
