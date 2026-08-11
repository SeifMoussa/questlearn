"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Tabs } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, QuestionSummary, archiveQuestion, getQuestion } from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_text: "Short text",
  numeric: "Numeric",
};

function AnswerKey({ question }: { question: QuestionSummary }) {
  const v = question.currentVersion;

  if (v.type === "single_choice" || v.type === "multiple_choice") {
    const correct = Array.isArray(v.correctAnswer) ? v.correctAnswer : [v.correctAnswer as string];
    return (
      <ul data-testid="answer-key-options" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {(v.options ?? []).map((option) => (
          <li
            key={option.id}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              marginBottom: 6,
              background: correct.includes(option.id) ? "var(--status-on-track-bg, #e6f4ea)" : "var(--surface-card)",
              color: correct.includes(option.id) ? "var(--status-on-track-fg, #1e7e34)" : "var(--text-primary)",
              fontWeight: correct.includes(option.id) ? "var(--fw-semibold)" : "var(--fw-regular)",
            }}
          >
            {option.text} {correct.includes(option.id) ? "(correct)" : ""}
          </li>
        ))}
      </ul>
    );
  }

  if (v.type === "true_false") {
    return <p data-testid="answer-key-value">Correct answer: {v.correctAnswer ? "True" : "False"}</p>;
  }

  if (v.type === "short_text") {
    return <p data-testid="answer-key-value">Accepted answers: {(v.correctAnswer as string[]).join(", ")}</p>;
  }

  const numeric = v.correctAnswer as { value: number; tolerance?: number };
  return (
    <p data-testid="answer-key-value">
      Correct value: {numeric.value}
      {numeric.tolerance !== undefined ? ` (± ${numeric.tolerance})` : ""}
    </p>
  );
}

/**
 * Renders the question the way a future learner will see it — no
 * visual emphasis on which option/answer is correct. This is a
 * rendering-fidelity preview, not an enforced security boundary: the
 * detail endpoint itself always returns the full answer key (see
 * apps/api's QuestionsService doc comment), since there's no
 * learner-facing surface to protect it from yet in this module.
 */
function LearnerPreview({ question }: { question: QuestionSummary }) {
  const v = question.currentVersion;

  return (
    <div data-testid="learner-preview" style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>{v.prompt}</p>

      {(v.type === "single_choice" || v.type === "multiple_choice") && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(v.options ?? []).map((option) => (
            <li key={option.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <input type={v.type === "single_choice" ? "radio" : "checkbox"} disabled readOnly />
              <span>{option.text}</span>
            </li>
          ))}
        </ul>
      )}

      {v.type === "true_false" && (
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" disabled readOnly /> True
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" disabled readOnly /> False
          </label>
        </div>
      )}

      {v.type === "short_text" && (
        <input type="text" disabled placeholder="Type your answer" style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }} />
      )}

      {v.type === "numeric" && (
        <input type="number" disabled placeholder="Enter a number" style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }} />
      )}

      {v.hint && (
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)" }}>Hint: {v.hint}</p>
      )}
    </div>
  );
}

export default function QuestionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const questionId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [question, setQuestion] = useState<QuestionSummary | null>(null);
  const [tab, setTab] = useState("Editor");

  const load = useCallback(() => {
    if (!accessToken) return;
    getQuestion(accessToken, questionId)
      .then((result) => {
        setQuestion(result);
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });
  }, [accessToken, questionId]);

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

  async function onArchive() {
    if (!accessToken || !question) return;
    const archiving = !question.archivedAt;
    if (archiving && !confirm("Archive this question? It will no longer appear in the active bank.")) {
      return;
    }
    await archiveQuestion(accessToken, question.id);
    load();
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="question-detail-loading">Loading question…</p>
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
          Question not found
        </h1>
        <p data-testid="question-not-found" style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This question doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/questions">Back to question bank</Link>
      </main>
    );
  }

  if (loadState === "error" || !question) {
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
      <p style={{ marginBottom: 16 }}>
        <Link href="/questions">Back to question bank</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Badge tone="brand">{TYPE_LABELS[question.currentVersion.type] ?? question.currentVersion.type}</Badge>
            <span data-testid="version-number" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Version {question.currentVersion.versionNumber}
            </span>
            {question.archivedAt && <Badge tone="neutral">Archived</Badge>}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", margin: 0, maxWidth: 600 }}>
            {question.currentVersion.prompt}
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/questions/${question.id}/edit`}>
            <Button variant="secondary" size="sm">
              Edit
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onArchive}>
            {question.archivedAt ? "Un-archive" : "Archive"}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 24, marginBottom: 20 }}>
        <Tabs items={["Editor", "Preview"]} active={tab} onChange={setTab} />
      </div>

      <section
        style={{
          background: "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: 24,
          maxWidth: 560,
        }}
      >
        {tab === "Editor" ? (
          <div data-testid="answer-key">
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Points: {question.currentVersion.points}</p>
            {question.currentVersion.hint && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>Hint: {question.currentVersion.hint}</p>
            )}
            {question.currentVersion.explanation && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Explanation: {question.currentVersion.explanation}</p>
            )}
            <h2 style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", marginBottom: 8 }}>Answer key</h2>
            <AnswerKey question={question} />
          </div>
        ) : (
          <LearnerPreview question={question} />
        )}
      </section>
    </main>
  );
}
