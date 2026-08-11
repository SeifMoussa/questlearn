"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, QuestionSummary, listQuestions } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_text: "Short text",
  numeric: "Numeric",
};

export default function QuestionsPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [questions, setQuestions] = useState<QuestionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;

    listQuestions(accessToken)
      .then((result) => {
        if (!cancelled) setQuestions(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your question bank.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  if (status === "loading" || (status === "authenticated" && questions === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="questions-loading">Loading your question bank…</p>
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
            Question bank
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
            Build and version questions for future activities.
          </p>
        </div>
        <Link href="/questions/new">
          <Button variant="primary" size="md">
            New question
          </Button>
        </Link>
      </div>

      {error && (
        <p role="alert" data-testid="questions-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && questions && questions.length === 0 && (
        <div
          data-testid="questions-empty"
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
            You haven&apos;t added a question yet.
          </p>
          <Link href="/questions/new">
            <Button variant="primary" size="md">
              Add your first question
            </Button>
          </Link>
        </div>
      )}

      {!error && questions && questions.length > 0 && (
        <div
          data-testid="questions-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}
        >
          {questions.map((q) => (
            <Link key={q.id} href={`/questions/${q.id}`} style={{ textDecoration: "none" }} data-testid="question-card">
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
                  <Badge tone="brand">{TYPE_LABELS[q.currentVersion.type] ?? q.currentVersion.type}</Badge>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{q.currentVersion.points} pts</span>
                </div>
                <p style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>
                  {q.currentVersion.prompt.length > 120 ? `${q.currentVersion.prompt.slice(0, 120)}…` : q.currentVersion.prompt}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
