"use client";

import { useEffect, useState } from "react";
import { fetchHealth, HealthReport } from "@/lib/health";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; report: HealthReport }
  | { kind: "error" };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(value: string | undefined): string {
  return value ? capitalize(value) : "Unknown";
}

export default function StatusPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((report) => {
        if (!cancelled) setState({ kind: "ready", report });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>QuestLearn</h1>

      {state.kind === "loading" && (
        <p data-testid="status-loading">Checking system status…</p>
      )}

      {state.kind === "error" && (
        <p data-testid="status-line" role="alert">
          QuestLearn — Web: Running / API: Disconnected / Database: Unknown /
          Redis: Unknown / Environment: Unknown
        </p>
      )}

      {state.kind === "ready" && (
        <p data-testid="status-line">
          QuestLearn — Web: Running / API:{" "}
          {statusLabel(state.report.api)} / Database:{" "}
          {statusLabel(state.report.database)} / Redis:{" "}
          {statusLabel(state.report.redis)} / Environment:{" "}
          {statusLabel(state.report.environment)}
        </p>
      )}
    </main>
  );
}
