"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import {
  ActivityDetail,
  ApiError,
  QuestionSummary,
  addActivityQuestion,
  archiveActivity,
  getActivity,
  listQuestions,
  publishActivity,
  removeActivityQuestion,
  reorderActivityQuestions,
} from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_text: "Short text",
  numeric: "Numeric",
};

export default function ActivityBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activityId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [bank, setBank] = useState<QuestionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    getActivity(accessToken, activityId)
      .then((result) => {
        setActivity(result);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
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
      listQuestions(accessToken).then(setBank).catch(() => setBank([]));
    }
  }, [status, accessToken, load]);

  async function withBusy(fn: () => Promise<void>) {
    if (!accessToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onAdd(questionId: string) {
    void withBusy(async () => {
      const updated = await addActivityQuestion(accessToken!, activityId, questionId);
      setActivity(updated);
    });
  }

  function onRemove(activityQuestionId: string) {
    void withBusy(async () => {
      const updated = await removeActivityQuestion(accessToken!, activityId, activityQuestionId);
      setActivity(updated);
    });
  }

  function onMove(index: number, direction: -1 | 1) {
    if (!activity) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activity.questions.length) return;

    const ids = activity.questions.map((q) => q.activityQuestionId);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);

    void withBusy(async () => {
      const updated = await reorderActivityQuestions(accessToken!, activityId, ids);
      setActivity(updated);
    });
  }

  function onPublish() {
    if (!activity) return;
    if (activity.questions.length === 0) {
      setPublishError("Add at least one question before publishing.");
      return;
    }
    if (!confirm("Publish this activity? Once published it can never be unpublished or restructured.")) {
      return;
    }
    setPublishError(null);
    void withBusy(async () => {
      const updated = await publishActivity(accessToken!, activityId);
      setActivity(updated);
    });
  }

  function onArchive() {
    if (!activity) return;
    if (!confirm("Archive this activity? It will no longer appear in the active list.")) return;
    void withBusy(async () => {
      const updated = await archiveActivity(accessToken!, activityId);
      setActivity(updated);
    });
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="activity-loading">Loading activity…</p>
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
          Activity not found
        </h1>
        <p data-testid="activity-not-found" style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This activity doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/activities">Back to activities</Link>
      </main>
    );
  }

  if (loadState === "error" || !activity) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          Something went wrong.
        </p>
      </main>
    );
  }

  const isDraft = activity.status === "draft";
  const addedQuestionIds = new Set(activity.questions.map((q) => q.questionId));
  const availableBank = (bank ?? []).filter((q) => !addedQuestionIds.has(q.id) && !q.archivedAt);

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/activities">Back to activities</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Badge tone={isDraft ? "neutral" : "onTrack"}>{isDraft ? "Draft" : "Published"}</Badge>
            {activity.archivedAt && <Badge tone="neutral">Archived</Badge>}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {activity.title}
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/activities/${activity.id}/preview`}>
            <Button variant="secondary" size="sm">
              Preview
            </Button>
          </Link>
          {!isDraft && (
            <Link href={`/activities/${activity.id}/assign`}>
              <Button variant="primary" size="sm">
                Assign
              </Button>
            </Link>
          )}
          {isDraft && (
            <Button variant="primary" size="sm" onClick={onPublish} disabled={busy}>
              Publish
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy}>
            {activity.archivedAt ? "Archived" : "Archive"}
          </Button>
        </div>
      </div>

      {!isDraft && (
        <div
          data-testid="published-locked-banner"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
            marginBottom: 24,
            maxWidth: 640,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--text-primary)" }}>
            Published — locked
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            This activity&apos;s questions and order are permanently frozen at what was published
            {activity.publishedAt ? ` on ${new Date(activity.publishedAt).toLocaleString()}` : ""}. Create a new
            activity for different content.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}
      {publishError && (
        <p role="alert" data-testid="publish-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {publishError}
        </p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>
          Questions ({activity.questions.length})
        </h2>

        {activity.questions.length === 0 && (
          <p data-testid="activity-questions-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No questions added yet.
          </p>
        )}

        <div data-testid="activity-question-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
          {activity.questions.map((q, index) => (
            <div
              key={q.activityQuestionId}
              data-testid="activity-question-row"
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
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                <Badge tone="brand">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {q.prompt}
                </span>
              </div>
              {isDraft && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" onClick={() => onMove(index, -1)} disabled={busy || index === 0}>
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMove(index, 1)}
                    disabled={busy || index === activity.questions.length - 1}
                  >
                    Down
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(q.activityQuestionId)} disabled={busy}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {isDraft && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Add from your question bank</h2>

          {availableBank.length === 0 && (
            <p data-testid="bank-picker-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              No more questions to add. <Link href="/questions/new">Create a new one</Link>.
            </p>
          )}

          <div data-testid="bank-picker-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
            {availableBank.map((q) => (
              <div
                key={q.id}
                data-testid="bank-picker-row"
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <Badge tone="neutral">{TYPE_LABELS[q.currentVersion.type] ?? q.currentVersion.type}</Badge>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.currentVersion.prompt}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onAdd(q.id)} disabled={busy}>
                  Add
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
