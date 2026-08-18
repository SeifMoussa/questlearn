"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, StatCard, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, ClassReport, getClassReport, getClassReportCsv } from "@/lib/api";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * Teacher dashboard (Module 9, §14 screenshot checkpoint): per-
 * assignment completion/average score, a compact per-concept mastery
 * summary (linking to Module 6's full grid rather than re-rendering
 * it), and a roster list linking to each learner's own report.
 */
export default function ClassReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { status, accessToken } = useAuth();

  const [report, setReport] = useState<ClassReport | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    getClassReport(accessToken, classId)
      .then(setReport)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Could not load the class report.");
        }
      });
  }, [accessToken, classId]);

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

  async function onDownloadCsv() {
    if (!accessToken || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const csv = await getClassReportCsv(accessToken, classId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report?.className ?? "class"}-report.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "Could not download the CSV.");
    } finally {
      setDownloading(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && report === null && !notFound && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="class-report-loading">Loading class report…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (notFound) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Class not found
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This class doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/classes">Back to classes</Link>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          {error ?? "Something went wrong."}
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href={`/classes/${classId}`}>Back to {report.className}</Link>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}>
            {report.className} — Report
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
            Completion, average score, and mastery across every assignment in this class.
          </p>
        </div>
        <Button variant="secondary" size="md" onClick={onDownloadCsv} disabled={downloading}>
          {downloading ? "Downloading…" : "Download CSV"}
        </Button>
      </div>

      {downloadError && (
        <p role="alert" data-testid="csv-download-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {downloadError}
        </p>
      )}

      <section data-testid="report-summary" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Overall completion" value={formatPercent(report.summary.overallCompletionRate)} tone="indigo" />
        <StatCard label="Overall average score" value={formatPercent(report.summary.overallAverageScore)} tone="teal" />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>
          Assignments ({report.assignments.length})
        </h2>

        {report.assignments.length === 0 && (
          <p data-testid="assignments-report-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No assignments in this class yet.
          </p>
        )}

        <div data-testid="assignments-report-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
          {report.assignments.map((a) => (
            <div
              key={a.assignmentId}
              data-testid="assignment-report-row"
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
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: "var(--fw-medium)", color: "var(--text-primary)", margin: 0 }}>
                  {a.title}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>
                  Due {formatDate(a.dueAt)} · {a.submittedCount}/{a.assignedCount} submitted
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Badge tone="brand">{formatPercent(a.completionRate)} complete</Badge>
                <Badge tone="neutral">{formatPercent(a.averageScore)} avg</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: 0 }}>Mastery summary</h2>
          <Link href={`/classes/${classId}/mastery`} style={{ fontSize: 13 }}>
            View full mastery grid
          </Link>
        </div>

        {report.masterySummary.length === 0 && (
          <p data-testid="mastery-summary-empty" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No mastery evidence recorded for this class yet.
          </p>
        )}

        <div data-testid="mastery-summary-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
          {report.masterySummary.map((c) => (
            <div
              key={c.conceptId}
              data-testid="mastery-summary-row"
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
              <span style={{ fontSize: 13, fontWeight: "var(--fw-medium)", color: "var(--text-primary)" }}>{c.conceptName}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <Badge tone="atRisk">{c.beginning} beginning</Badge>
                <Badge tone="needsSupport">{c.developing} developing</Badge>
                <Badge tone="onTrack">{c.proficient} proficient</Badge>
                <Badge tone="onTrack">{c.mastered} mastered</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", marginBottom: 12 }}>
          Learners ({report.learners.length})
        </h2>

        <div data-testid="report-learners-list" style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          {report.learners.map((l) => (
            <div
              key={l.rosterEntryId}
              data-testid="report-learner-row"
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{l.name}</span>
              {l.learnerId ? (
                <Link href={`/classes/${classId}/learners/${l.learnerId}/report`} style={{ fontSize: 12 }}>
                  View report
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Not yet registered</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
