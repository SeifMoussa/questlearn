"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, SchoolClass, listClasses } from "@/lib/api";

export default function ClassesPage() {
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
        <p data-testid="classes-loading">Loading your classes…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}>
            Your classes
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
            Create classes, share join codes, and manage your rosters.
          </p>
        </div>
        <Link href="/classes/new">
          <Button variant="primary" size="md">
            New class
          </Button>
        </Link>
      </div>

      {error && (
        <p role="alert" data-testid="classes-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && classes && classes.length === 0 && (
        <div
          data-testid="classes-empty"
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
            You haven&apos;t created a class yet.
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
          data-testid="classes-list"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}
        >
          {classes.map((cls) => (
            <Link
              key={cls.id}
              href={`/classes/${cls.id}`}
              style={{ textDecoration: "none" }}
              data-testid="class-card"
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
                <Badge tone="brand">Join code: {cls.joinCode.slice(0, 4)}…</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
