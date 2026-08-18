"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Select } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  ActivitySummary,
  ApiError,
  Concept,
  QuestDetail,
  QuestMasteryThreshold,
  addQuestStep,
  archiveQuest,
  getQuest,
  listActivities,
  listConcepts,
  removeQuestStep,
  reorderQuestSteps,
} from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

const THRESHOLD_OPTIONS: QuestMasteryThreshold[] = ["beginning", "developing", "proficient", "mastered"];
const THRESHOLD_LABELS: Record<QuestMasteryThreshold, string> = {
  beginning: "Beginning",
  developing: "Developing",
  proficient: "Proficient",
  mastered: "Mastered",
};

const NONE = "— None —";

function describeStep(step: QuestDetail["steps"][number]): string {
  const parts: string[] = [];
  if (step.activityTitle) parts.push(`Complete "${step.activityTitle}"`);
  if (step.conceptName && step.requiredMasteryState) {
    parts.push(`Reach ${THRESHOLD_LABELS[step.requiredMasteryState]} on "${step.conceptName}"`);
  }
  return parts.join(" AND ");
}

export default function QuestBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const questId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [quest, setQuest] = useState<QuestDetail | null>(null);
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedActivityTitle, setSelectedActivityTitle] = useState(NONE);
  const [selectedConceptName, setSelectedConceptName] = useState(NONE);
  const [selectedThreshold, setSelectedThreshold] = useState<QuestMasteryThreshold>("proficient");
  const [addStepError, setAddStepError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getQuest(accessToken, questId)
      .then((result) => {
        setQuest(result);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });
  }, [accessToken, questId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accessToken) {
      load();
      listActivities(accessToken).then(setActivities).catch(() => setActivities([]));
      listConcepts(accessToken).then(setConcepts).catch(() => setConcepts([]));
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

  function onAddStep() {
    setAddStepError(null);
    const activity = activities.find((a) => a.title === selectedActivityTitle);
    const concept = concepts.find((c) => c.name === selectedConceptName);

    if (!activity && !concept) {
      setAddStepError("Choose an activity, a mastery goal, or both.");
      return;
    }

    void withBusy(async () => {
      const updated = await addQuestStep(accessToken!, questId, {
        activityId: activity?.id,
        requiredConceptId: concept?.id,
        requiredMasteryState: concept ? selectedThreshold : undefined,
      });
      setQuest(updated);
      setSelectedActivityTitle(NONE);
      setSelectedConceptName(NONE);
    });
  }

  function onRemoveStep(stepId: string) {
    void withBusy(async () => {
      const updated = await removeQuestStep(accessToken!, questId, stepId);
      setQuest(updated);
    });
  }

  function onMove(index: number, direction: -1 | 1) {
    if (!quest) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= quest.steps.length) return;

    const ids = quest.steps.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);

    void withBusy(async () => {
      const updated = await reorderQuestSteps(accessToken!, questId, ids);
      setQuest(updated);
    });
  }

  function onArchive() {
    if (!quest) return;
    if (!confirm("Archive this quest? It will no longer appear for learners.")) return;
    void withBusy(async () => {
      const updated = await archiveQuest(accessToken!, questId);
      setQuest(updated);
    });
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="quest-loading">Loading quest…</p>
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
          Quest not found
        </h1>
        <p data-testid="quest-not-found" style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This quest doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/quests">Back to quests</Link>
      </main>
    );
  }

  if (loadState === "error" || !quest) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          Something went wrong.
        </p>
      </main>
    );
  }

  const publishedActivities = activities.filter((a) => a.status === "published" && !a.archivedAt);
  const activityOptions = [NONE, ...publishedActivities.map((a) => a.title)];
  const conceptOptions = [NONE, ...concepts.filter((c) => !c.archivedAt).map((c) => c.name)];

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/quests">Back to quests</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Badge tone="brand">
              {quest.steps.length} step{quest.steps.length === 1 ? "" : "s"}
            </Badge>
            {quest.archivedAt && <Badge tone="neutral">Archived</Badge>}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {quest.title}
          </h1>
          {quest.description && (
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6, maxWidth: 480 }}>{quest.description}</p>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy}>
          {quest.archivedAt ? "Archived" : "Archive"}
        </Button>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Steps ({quest.steps.length})</h2>

        {quest.steps.length === 0 && (
          <p data-testid="quest-steps-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No steps added yet.
          </p>
        )}

        <div data-testid="quest-step-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
          {quest.steps.map((step, index) => (
            <div
              key={step.id}
              data-testid="quest-step-row"
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
                <Badge tone="neutral">Step {index + 1}</Badge>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{describeStep(step)}</span>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <Button variant="ghost" size="sm" onClick={() => onMove(index, -1)} disabled={busy || index === 0}>
                  Up
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onMove(index, 1)} disabled={busy || index === quest.steps.length - 1}>
                  Down
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onRemoveStep(step.id)} disabled={busy}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>Add a step</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16, maxWidth: 480 }}>
          Choose an activity, a mastery goal, or both — a combined step requires both to be met.
        </p>

        {addStepError && (
          <p role="alert" data-testid="add-step-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
            {addStepError}
          </p>
        )}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", maxWidth: 640, marginBottom: 16 }}>
          <FormField label="Require activity completion" htmlFor="activity-select">
            <Select options={activityOptions} value={selectedActivityTitle} onChange={setSelectedActivityTitle} />
          </FormField>
          <FormField label="Require mastery on concept" htmlFor="concept-select">
            <Select options={conceptOptions} value={selectedConceptName} onChange={setSelectedConceptName} />
          </FormField>
          {selectedConceptName !== NONE && (
            <FormField label="At or above" htmlFor="threshold-select">
              <Select
                options={THRESHOLD_OPTIONS.map((t) => THRESHOLD_LABELS[t])}
                value={THRESHOLD_LABELS[selectedThreshold]}
                onChange={(label) => {
                  const match = THRESHOLD_OPTIONS.find((t) => THRESHOLD_LABELS[t] === label);
                  if (match) setSelectedThreshold(match);
                }}
              />
            </FormField>
          )}
        </div>

        <Button variant="primary" size="md" onClick={onAddStep} disabled={busy}>
          Add step
        </Button>

        {publishedActivities.length === 0 && (
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 12 }}>
            No published activities yet — <Link href="/activities">publish one</Link> to gate a step on it.
          </p>
        )}
      </section>
    </main>
  );
}
