"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Select } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import {
  ActivityDetail,
  ApiError,
  AssignmentSummary,
  SchoolClass,
  createAssignment,
  getActivity,
  listAssignments,
  listClasses,
} from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function AssignActivityPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activityId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentSummary[] | null>(null);

  const [selectedClassName, setSelectedClassName] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    getActivity(accessToken, activityId)
      .then((result) => {
        setActivity(result);
        setLoadState("loaded");
      })
      .catch((err) => {
        setLoadState(err instanceof ApiError && err.status === 404 ? "not-found" : "error");
      });
    listAssignments(accessToken, { activityId }).then(setAssignments).catch(() => setAssignments([]));
  }, [accessToken, activityId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accessToken) {
      load();
      listClasses(accessToken).then(setClasses).catch(() => setClasses([]));
    }
  }, [status, accessToken, load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const cls = (classes ?? []).find((c) => c.name === selectedClassName);
    const clientErrors: Record<string, string> = {};
    if (!cls) clientErrors.classId = "Choose a class.";
    if (!dueAt) clientErrors.dueAt = "Choose a due date.";
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    if (!accessToken || !cls) return;
    setSubmitting(true);
    try {
      await createAssignment(accessToken, {
        classId: cls.id,
        activityId,
        dueAt: new Date(dueAt).toISOString(),
      });
      setDueAt("");
      load();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          fieldErrors[field] = messages[0];
        }
        setErrors(fieldErrors);
      } else if (error instanceof ApiError) {
        setBanner(error.message);
      } else {
        setBanner("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="assign-loading">Loading…</p>
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
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
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

  const isPublished = activity.status === "published";
  const classNames = (classes ?? []).filter((c) => !c.archivedAt).map((c) => c.name);

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/activities/${activityId}`}>Back to activity</Link>
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <Badge tone={isPublished ? "onTrack" : "neutral"}>{isPublished ? "Published" : "Draft"}</Badge>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Assign &ldquo;{activity.title}&rdquo;
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 480 }}>
        Assign this activity to a class with a due date. Learners enrolled in
        that class will see it on their dashboard.
      </p>

      {!isPublished && (
        <p
          role="alert"
          data-testid="assign-requires-published"
          style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16, maxWidth: 480 }}
        >
          This activity is still a draft. Publish it before assigning it to a
          class.
        </p>
      )}

      {isPublished && (
        <>
          {banner && (
            <p role="alert" data-testid="assign-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
              {banner}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate style={{ maxWidth: 420, marginBottom: 40 }}>
            <FormField label="Class" htmlFor="classId" error={errors.classId}>
              <Select
                options={classNames}
                value={selectedClassName}
                onChange={setSelectedClassName}
              />
            </FormField>
            <FormField label="Due date" htmlFor="dueAt" error={errors.dueAt}>
              <input
                id="dueAt"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                style={{ height: 40, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", fontFamily: "var(--font-ui)", fontSize: 14 }}
              />
            </FormField>
            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              {submitting ? "Assigning…" : "Assign"}
            </Button>
          </form>
        </>
      )}

      <section>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>
          Existing assignments ({assignments?.length ?? 0})
        </h2>
        {(assignments ?? []).length === 0 ? (
          <p data-testid="assignments-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Not assigned to any class yet.
          </p>
        ) : (
          <ul data-testid="assignments-list" style={{ listStyle: "none", padding: 0, maxWidth: 560 }}>
            {(assignments ?? []).map((a) => (
              <li
                key={a.id}
                data-testid="assignment-row"
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-card)",
                  padding: "10px 14px",
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{a.class.name}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Due {new Date(a.dueAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
