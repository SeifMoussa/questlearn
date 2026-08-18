"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, QuestStepper, QuestStepStatus } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, QuestMasteryThreshold, QuestProgress, getMyQuests, getQuestProgress } from "@/lib/api";

const THRESHOLD_LABELS: Record<QuestMasteryThreshold, string> = {
  beginning: "Beginning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

function describeStep(step: QuestProgress["steps"][number]): string {
  const parts: string[] = [];
  if (step.activityTitle) parts.push(`Complete "${step.activityTitle}"`);
  if (step.conceptName && step.requiredMasteryState) {
    parts.push(`Reach ${THRESHOLD_LABELS[step.requiredMasteryState]} on "${step.conceptName}"`);
  }
  return parts.join(" AND ");
}

function statusOf(step: QuestProgress["steps"][number]): QuestStepStatus {
  if (step.complete) return "completed";
  if (step.unlocked) return "active";
  return "locked";
}

/**
 * Learner-facing quest map (Module 8, §14 screenshot checkpoint):
 * every non-archived quest in the tenant, rendered as a linear
 * QuestStepper — locked/active/completed derived entirely from the
 * live progress the API already computed, never re-derived here.
 */
export default function QuestMapPage() {
  const router = useRouter();
  const { status, accessToken, user } = useAuth();

  const [quests, setQuests] = useState<QuestProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "teacher") {
      router.replace("/quests");
    }
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken || user?.role === "teacher") return;
    let cancelled = false;

    getMyQuests(accessToken)
      .then((rows) => Promise.all(rows.map((row) => getQuestProgress(accessToken, row.id))))
      .then((result) => {
        if (!cancelled) setQuests(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your quests.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken, user]);

  if (status === "loading" || user?.role === "teacher" || (status === "authenticated" && quests === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="quest-map-loading">Loading your quests…</p>
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
        Quests
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 480 }}>
        Complete each step in order to unlock the next, and earn a bonus reward when you finish.
      </p>

      {error && (
        <p role="alert" data-testid="quest-map-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && quests && quests.length === 0 && (
        <div
          data-testid="quest-map-empty"
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: 32,
            textAlign: "center",
            maxWidth: 480,
          }}
        >
          <p style={{ fontSize: 15, color: "var(--text-primary)", margin: 0 }}>
            No quests have been built for your class yet.
          </p>
        </div>
      )}

      {!error && quests && quests.length > 0 && (
        <div data-testid="quest-map-list" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
          {quests.map((quest) => (
            <div
              key={quest.id}
              data-testid="quest-map-card"
              data-quest-complete={quest.complete ? "true" : "false"}
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-card)",
                padding: 24,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <h2 style={{ fontSize: 17, fontWeight: "var(--fw-semibold)", margin: 0 }}>{quest.title}</h2>
                {quest.complete && (
                  <span data-testid="quest-complete-badge">
                    <Badge tone="onTrack">Completed{quest.xpAwarded !== null ? ` — +${quest.xpAwarded} XP` : ""}</Badge>
                  </span>
                )}
              </div>
              {quest.description && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 16px" }}>{quest.description}</p>
              )}

              <QuestStepper
                steps={quest.steps.map((step) => ({
                  label: describeStep(step),
                  status: statusOf(step),
                }))}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
