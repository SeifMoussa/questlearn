/**
 * Pure gamification math (Master Spec §12/§14, functional requirement
 * #8). Kept free of any database/HTTP concern so it's unit-testable
 * in isolation — see `gamification-formula.spec.ts`, mirroring the
 * split already established by `mastery-formula.ts`.
 *
 *   xp(attempt) = ATTEMPT_COMPLETION_XP + round(totalAwardedPoints * XP_PER_POINT)
 *   xpRequiredForLevel(level) = LEVEL_XP_COEFFICIENT * level * (level - 1)
 *
 * `xpRequiredForLevel` is a level-1-starts-at-0 quadratic curve, so
 * each level costs progressively more XP than the last (level 2 costs
 * 100 XP, level 3 costs another 200, level 4 another 300, ...) without
 * needing a lookup table.
 */

/** XP awarded per whole point of `pointsAwarded` on a graded attempt. */
export const XP_PER_POINT = 10;

/** Flat XP awarded just for completing (submitting) an attempt. */
export const ATTEMPT_COMPLETION_XP = 20;

/** Coefficient of the quadratic level-threshold curve. */
export const LEVEL_XP_COEFFICIENT = 50;

export function xpForAttempt(totalAwardedPoints: number): number {
  return ATTEMPT_COMPLETION_XP + Math.round(totalAwardedPoints * XP_PER_POINT);
}

/** Total XP required to have REACHED `level` (level 1 requires 0). */
export function xpRequiredForLevel(level: number): number {
  return LEVEL_XP_COEFFICIENT * level * (level - 1);
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number; // XP needed *within* the current level to reach the next one
}

/**
 * Walks upward from level 1 while `totalXp` has already reached the
 * next level's threshold — landing exactly on a threshold counts as
 * having reached that level (`>=`, not `>`), so XP=300 is level 3, not
 * level 2 with a full bar.
 */
export function levelForXp(totalXp: number): LevelProgress {
  let level = 1;
  while (totalXp >= xpRequiredForLevel(level + 1)) {
    level += 1;
  }

  const currentThreshold = xpRequiredForLevel(level);
  const nextThreshold = xpRequiredForLevel(level + 1);

  return {
    level,
    totalXp,
    xpIntoLevel: totalXp - currentThreshold,
    xpForNextLevel: nextThreshold - currentThreshold,
  };
}
