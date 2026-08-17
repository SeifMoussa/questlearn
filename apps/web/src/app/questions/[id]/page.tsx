"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Select, Tabs, Tag } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  Concept,
  QuestionSummary,
  archiveQuestion,
  getQuestion,
  listConcepts,
  updateQuestionConcepts,
} from "@/lib/api";
import { QuestionRenderer } from "@/components/QuestionRenderer";

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
 * Full-set-replacement concept tagging (Module 6): concepts attach to
 * the `Question`, not its versioned content, so this section lives
 * outside the Editor/Preview tabs and never triggers a new version.
 * Mirrors the accepted-answers `Tag` pattern from `QuestionForm.tsx`
 * (short_text questions) — a picker to add, a chip per attached
 * concept with a remove action.
 */
function ConceptsSection({
  question,
  allConcepts,
  onChanged,
}: {
  question: QuestionSummary;
  allConcepts: Concept[];
  onChanged: () => void;
}) {
  const { accessToken } = useAuth();
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);

  const attached = question.concepts ?? [];
  const attachedIds = new Set(attached.map((c) => c.conceptId));
  const available = allConcepts.filter((c) => !c.archivedAt && !attachedIds.has(c.id));

  async function addConcept(conceptId: string) {
    if (!accessToken || !conceptId) return;
    setSaving(true);
    try {
      const nextIds = [...attached.map((c) => c.conceptId), conceptId];
      await updateQuestionConcepts(accessToken, question.id, nextIds);
      setPicked("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function removeConcept(conceptId: string) {
    if (!accessToken) return;
    setSaving(true);
    try {
      const nextIds = attached.map((c) => c.conceptId).filter((id) => id !== conceptId);
      await updateQuestionConcepts(accessToken, question.id, nextIds);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="concepts-section"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 24,
        maxWidth: 560,
        marginTop: 20,
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", marginBottom: 8 }}>Concepts</h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
        Tags used to attribute mastery evidence when this question is graded. Editing the question&apos;s
        wording never requires re-tagging.
      </p>

      <div data-testid="attached-concepts" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {attached.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>No concepts tagged yet.</span>
        )}
        {attached.map((tag) => (
          <Tag key={tag.id} onRemove={saving ? undefined : () => removeConcept(tag.conceptId)}>
            {tag.concept.name}
          </Tag>
        ))}
      </div>

      {available.length > 0 ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Select
            options={["", ...available.map((c) => c.name)]}
            value={picked}
            onChange={(name) => {
              setPicked(name);
              const concept = available.find((c) => c.name === name);
              if (concept) addConcept(concept.id);
            }}
            size="sm"
          />
        </div>
      ) : (
        allConcepts.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            No concepts exist yet — <Link href="/concepts">create one</Link> first.
          </p>
        )
      )}
    </section>
  );
}

export default function QuestionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const questionId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [question, setQuestion] = useState<QuestionSummary | null>(null);
  const [allConcepts, setAllConcepts] = useState<Concept[]>([]);
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
      listConcepts(accessToken).then(setAllConcepts).catch(() => {});
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
          <QuestionRenderer question={question.currentVersion} />
        )}
      </section>

      <ConceptsSection question={question} allConcepts={allConcepts} onChanged={load} />
    </main>
  );
}
