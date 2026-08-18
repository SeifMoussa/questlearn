"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, SchoolClass, listClasses } from "@/lib/api";

/**
 * Reports landing page (audit follow-up): the three report views
 * (class dashboard, question analysis, learner report) previously had
 * no entry point from the teacher dashboard at all — a teacher had to
 * already be on a specific class's or activity's detail page to
 * discover they existed. Reuses `listClasses` (same data `/classes`
 * already fetches) rather than adding a new backend aggregate
 * endpoint; each card links straight to that class's `/report` page
 * instead of its plain detail page. Question analysis has no
 * standalone landing page here — it's still reached from a published
 * activity's own detail page, since there's no natural "list of every
 * report-eligible activity across every class" grouping to build one
 * around.
 */
export default function ReportsLandingPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;

    listClasses(accessToken)
      .then((result) => {
        if (!cancelled) setClasses(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load your classes.");
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  if (status === "loading" || (status === "authenticated" && classes === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="reports-loading">Loading your reports…</p>
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
        Reports
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 560 }}>
        Pick a class to see its completion rate, average score, and mastery
        summary. Question analysis is on a published activity&apos;s own
        detail page.
      </p>

      {error && (
        <p role="alert" data-testid="reports-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && classes && classes.length === 0 && (
        <div
          data-testid="reports-empty"
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
            You haven&apos;t created a class yet — reports have nothing to show until one exists.
          </p>
          <Link href="/classes/new">
            <Button variant="primary" size="md">
              Create your first class
            </Button>
          </Link>
        </div>
      )}

      {!error && classes && classes.length > 0 && (
        <div
          data-testid="reports-class-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
        >
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/classes/${cls.id}/report`}
              style={{ textDecoration: "none" }}
              data-testid="reports-class-card"
            >
              <div
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-card)",
                  padding: 20,
                  height: "100%",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                    fontWeight: "var(--fw-semibold)",
                    color: "var(--text-primary)",
                    margin: "0 0 8px",
                  }}
                >
                  {cls.name}
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
                  {cls.roster.length} {cls.roster.length === 1 ? "student" : "students"}
                </p>
                <Badge tone="brand">View report</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
