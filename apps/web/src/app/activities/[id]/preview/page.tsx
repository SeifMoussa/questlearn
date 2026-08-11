"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ActivityDetail, ApiError, getActivity } from "@/lib/api";
import { QuestionRenderer } from "@/components/QuestionRenderer";

type LoadState = "loading" | "loaded" | "not-found" | "error";

/**
 * Renders every question in the activity, in order, using the same
 * QuestionRenderer as the single-question preview — learner-style,
 * no answer-key emphasis. Works identically for draft (live content,
 * resolved off each question's current version server-side) and
 * published (pinned content) activities: this page has no opinion on
 * which — it just renders whatever the detail endpoint resolved.
 */
export default function ActivityPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activityId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activity, setActivity] = useState<ActivityDetail | null>(null);

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
    }
  }, [status, accessToken, load]);

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="activity-preview-loading">Loading preview…</p>
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

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/activities/${activity.id}`}>Back to builder</Link>
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <Badge tone={activity.status === "published" ? "onTrack" : "neutral"}>
          {activity.status === "published" ? "Published" : "Draft"}
        </Badge>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", marginBottom: 24 }}>
        {activity.title}
      </h1>

      <div data-testid="activity-preview-questions" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {activity.questions.map((q, index) => (
          <section
            key={q.activityQuestionId}
            data-testid="activity-preview-question"
            style={{
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              padding: 24,
              maxWidth: 560,
            }}
          >
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              Question {index + 1} of {activity.questions.length} — {q.points} pt{q.points === 1 ? "" : "s"}
            </p>
            <QuestionRenderer question={q} />
          </section>
        ))}
      </div>
    </main>
  );
}
