/**
 * Pure mastery-formula math (Master Spec §6.7, assumption A5). Kept
 * free of any database/HTTP concern so it's unit-testable in
 * isolation — see `mastery-formula.spec.ts`.
 *
 * Constants are named and exported, not buried inline, so they're
 * easy to find and tune:
 *
 *   effective_response_score = (pointsAwarded / points) * (hintViewed ? HINT_PENALTY_MULTIPLIER : 1.0)
 *   recency_weight(evidence) = 0.5 ^ (days_since_recorded / RECENCY_HALF_LIFE_DAYS)
 *   mastery(concept) = sum(effective_response_score * recency_weight) / sum(recency_weight)
 *
 * There is deliberately no cached/stored mastery value anywhere —
 * `recency_weight` is evaluated against the actual current timestamp
 * every time mastery is read, so a concept practiced only long ago
 * scores lower today than it did on the day the evidence was
 * recorded, without ever re-writing a row. A cached value would only
 * be as fresh as its last recompute, which either means a background
 * job (explicitly out of scope for this module) or a mastery score
 * that quietly goes stale between attempts.
 */

/** 15% score penalty applied when the learner viewed the hint. */
export const HINT_PENALTY_MULTIPLIER = 0.85;

/** Recency half-life, in days: evidence loses half its weight every 14 days. */
export const RECENCY_HALF_LIFE_DAYS = 14;

export type MasteryState = "not_started" | "beginning" | "developing" | "proficient" | "mastered";

export interface MasteryStateCutoff {
  state: Exclude<MasteryState, "not_started">;
  min: number;
}

// Ascending cutoffs on the 0-1 score. "not_started" is not represented
// here — it applies only when there is zero evidence, handled
// separately by the caller, never derived from a score.
const STATE_CUTOFFS: MasteryStateCutoff[] = [
  { state: "beginning", min: 0 },
  { state: "developing", min: 0.4 },
  { state: "proficient", min: 0.7 },
  { state: "mastered", min: 0.9 },
];

/**
 * `pointsAwarded / points`, clamped to [0,1] (defensive — grading
 * already produces a value in range, but a malformed points value of
 * 0 would otherwise divide by zero), scaled by the hint penalty.
 */
export function effectiveResponseScore(pointsAwarded: number, points: number, hintViewed: boolean): number {
  const fraction = points > 0 ? pointsAwarded / points : 0;
  const clamped = Math.max(0, Math.min(1, fraction));
  return clamped * (hintViewed ? HINT_PENALTY_MULTIPLIER : 1.0);
}

/**
 * `daysSinceRecorded` may be fractional (real elapsed time, not a
 * calendar-day count) and is expected to be >= 0; a negative value
 * (clock skew) is clamped to 0 so recency weight never exceeds 1.
 */
export function recencyWeight(daysSinceRecorded: number): number {
  const days = Math.max(0, daysSinceRecorded);
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

export interface WeightedEvidencePoint {
  effectiveResponseScore: number;
  daysSinceRecorded: number;
}

/**
 * Recency-weighted average of `effectiveResponseScore` across all
 * evidence for one concept. Returns `null` for an empty evidence set
 * — the caller is responsible for surfacing that as "not_started"
 * rather than a score of 0, per the locked design decision that a
 * concept with zero evidence has no mastery state at all.
 */
export function weightedMasteryScore(evidence: WeightedEvidencePoint[]): number | null {
  if (evidence.length === 0) return null;

  let weightedSum = 0;
  let weightSum = 0;
  for (const point of evidence) {
    const weight = recencyWeight(point.daysSinceRecorded);
    weightedSum += point.effectiveResponseScore * weight;
    weightSum += weight;
  }

  // weightSum can only be 0 if every daysSinceRecorded were infinite,
  // which cannot happen for real timestamps; guarded defensively.
  if (weightSum === 0) return 0;
  return weightedSum / weightSum;
}

/**
 * Maps a 0-1 mastery score to its state per the locked cutoffs:
 * Beginning 0-0.39, Developing 0.40-0.69, Proficient 0.70-0.89,
 * Mastered 0.90-1.00. No minimum-evidence-count gating — a single
 * evidence row fully determines state, so this function never needs
 * an evidence count, only the already-aggregated score.
 */
export function stateForScore(score: number): Exclude<MasteryState, "not_started"> {
  let resolved: Exclude<MasteryState, "not_started"> = STATE_CUTOFFS[0].state;
  for (const cutoff of STATE_CUTOFFS) {
    if (score >= cutoff.min) {
      resolved = cutoff.state;
    }
  }
  return resolved;
}
