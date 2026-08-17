"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, ProgressBar, StatCard } from "@questlearn/design-system";
import { useAuth } from "@/lib/auth-context";
import { ApiError, BadgeType, GamificationProfile, getGamificationProfile } from "@/lib/api";

const BADGE_ORDER: BadgeType[] = ["quest_starter", "perfect_score", "concept_champion", "persistent_learner", "rising_star"];

const BADGE_LABELS: Record<BadgeType, string> = {
  quest_starter: "Quest Starter",
  perfect_score: "Perfect Score",
  concept_champion: "Concept Champion",
  persistent_learner: "Persistent Learner",
  rising_star: "Rising Star",
};

const BADGE_DESCRIPTIONS: Record<BadgeType, string> = {
  quest_starter: "Complete your first attempt.",
  perfect_score: "Score 100% on an attempt.",
  concept_champion: "Reach mastered on any concept.",
  persistent_learner: "Complete 5 attempts.",
  rising_star: "Reach level 5.",
};

/**
 * Learner-facing XP & achievements view (Module 7, §14 screenshot
 * checkpoints): XP profile, level progress bar, and a fixed 5-badge
 * achievements grid. All 5 `BadgeType`s always render, earned or not
 * — so the grid stays legible even for a learner with 0 badges,
 * matching the same "always show the full shape" posture as the
 * mastery page's concept cards.
 */
export default function XpPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();

  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getGamificationProfile(accessToken)
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your XP profile."));
  }, [accessToken]);

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

  if (status === "loading" || (status === "authenticated" && profile === null && !error)) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="xp-loading">Loading your XP…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  const earnedBadges = new Map((profile?.badges ?? []).map((b) => [b.badgeType, b]));
  const levelPercent =
    profile && profile.xpForNextLevel > 0 ? Math.round((profile.xpIntoLevel / profile.xpForNextLevel) * 100) : 100;

  return (
    <main style={{ padding: 48, fontFamily: "var(--font-ui)", background: "var(--surface-page)", minHeight: "100vh" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: "var(--fw-semibold)", margin: "0 0 8px" }}>
        XP & Achievements
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, maxWidth: 480 }}>
        Earn XP by completing assignments, and unlock badges for milestones
        along the way.
      </p>

      {error && (
        <p role="alert" data-testid="xp-error" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!error && profile && (
        <>
          <section data-testid="xp-profile" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32, maxWidth: 800 }}>
            <StatCard label="Total XP" value={profile.totalXp} tone="indigo" />
            <StatCard label="Level" value={profile.level} tone="teal" />
          </section>

          <section data-testid="level-progress" style={{ marginBottom: 32, maxWidth: 480 }}>
            <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: "0 0 12px" }}>Level progress</h2>
            <div
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-card)",
                padding: 20,
              }}
            >
              <ProgressBar
                value={levelPercent}
                tone="indigo"
                label={`Level ${profile.level} -> ${profile.level + 1}`}
              />
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0" }}>
                {profile.xpIntoLevel} / {profile.xpForNextLevel} XP into this level
              </p>
            </div>
          </section>

          <section data-testid="achievements-grid" style={{ maxWidth: 800 }}>
            <h2 style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", margin: "0 0 12px" }}>Achievements</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {BADGE_ORDER.map((badgeType) => {
                const earned = earnedBadges.get(badgeType);
                return (
                  <div
                    key={badgeType}
                    data-testid="achievement-badge"
                    data-earned={earned ? "true" : "false"}
                    style={{
                      background: "var(--surface-card)",
                      borderRadius: "var(--radius-lg)",
                      boxShadow: "var(--shadow-card)",
                      padding: 18,
                      opacity: earned ? 1 : 0.55,
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <Badge tone={earned ? "brand" : "neutral"}>{BADGE_LABELS[badgeType]}</Badge>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                      {BADGE_DESCRIPTIONS[badgeType]}
                    </p>
                    {earned && (
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0" }}>
                        Earned {new Date(earned.awardedAt).toLocaleDateString()}
                      </p>
                    )}
                    {!earned && (
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0" }}>Locked</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
