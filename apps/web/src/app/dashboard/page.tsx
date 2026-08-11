"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, StatCard } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="dashboard-loading">Loading your dashboard…</p>
      </main>
    );
  }

  if (status !== "authenticated" || !user) {
    // Redirect effect above is already in flight; render nothing.
    return null;
  }

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1
            data-testid="dashboard-greeting"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: 0 }}
          >
            Welcome back, {user.name}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>{user.email}</p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            void logout().then(() => router.push("/login"));
          }}
        >
          Log out
        </Button>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Quests" value="0" />
        <StatCard label="Students" value="0" />
        <StatCard label="Mastery" value="—" />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/classes">
          <Button variant="secondary" size="md">
            Manage classes
          </Button>
        </Link>
        <Link href="/questions">
          <Button variant="secondary" size="md">
            Question bank
          </Button>
        </Link>
        <Link href="/activities">
          <Button variant="secondary" size="md">
            Activities
          </Button>
        </Link>
      </div>

      <p style={{ marginTop: 32, color: "var(--text-secondary)", fontSize: 14, maxWidth: 480 }}>
        This is a placeholder dashboard — quests and analytics land in a
        later module. Classes are managed on their own page.
      </p>
    </main>
  );
}
