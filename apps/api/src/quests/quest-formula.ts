/**
 * Pure quest math and gate logic (Master Spec §12/§14, functional
 * requirement #9). Kept free of any database/HTTP concern so it's
 * unit-testable in isolation — see `quest-formula.spec.ts`, mirroring
 * the split already established by `mastery-formula.ts` and
 * `gamification-formula.ts`.
 *
 * What's deliberately NOT here: actually fetching whether a learner
 * submitted an attempt for a step's activity, or their live mastery
 * state for a step's concept — those are database reads that live in
 * `QuestsService`. This module only combines already-resolved booleans
 * / states into "is this step complete," "how many steps are
 * unlocked," and "how much XP does completing this quest pay out."
 */

import type { MasteryState } from "../mastery/mastery-formula";

/** Flat XP paid out on quest completion, regardless of step count. */
export const QUEST_COMPLETION_BASE_XP = 50;

/** Additional XP per step, so longer quests pay out more. */
export const QUEST_COMPLETION_XP_PER_STEP = 10;

export function xpForQuestCompletion(stepCount: number): number {
  return QUEST_COMPLETION_BASE_XP + QUEST_COMPLETION_XP_PER_STEP * stepCount;
}

/**
 * Ordinal ordering of `MasteryState`, ascending. Mirrors the cutoff
 * ordering in `mastery-formula.ts`'s `STATE_CUTOFFS`, but as a plain
 * ordinal list rather than score cutoffs — a `QuestStep`'s required
 * threshold is a named state, not a 0-1 score, so comparison happens
 * here rather than by re-deriving a score.
 */
const MASTERY_STATE_ORDER: MasteryState[] = ["not_started", "beginning", "developing", "proficient", "mastered"];

/** True if `actual` is at or above `required` on the mastery ladder. */
export function meetsMasteryThreshold(actual: MasteryState, required: MasteryState): boolean {
  return MASTERY_STATE_ORDER.indexOf(actual) >= MASTERY_STATE_ORDER.indexOf(required);
}

/**
 * The two gates a `QuestStep` can configure, already resolved to
 * booleans by the caller (`null` means that gate isn't configured on
 * this step at all, not that it evaluated false). Combining with AND
 * when both are set is the "and/or" from FR#9 — expressed by which
 * fields the teacher populated, not a separate operator field.
 *
 * A step with both gates `null` (neither configured) is rejected by
 * `QuestsService` at creation time — this function doesn't re-enforce
 * that invariant, it just treats an absent gate as no constraint.
 */
export interface StepGateStatus {
  activityGateSatisfied: boolean | null;
  masteryGateSatisfied: boolean | null;
}

export function isStepComplete(status: StepGateStatus): boolean {
  const activityOk = status.activityGateSatisfied ?? true;
  const masteryOk = status.masteryGateSatisfied ?? true;
  return activityOk && masteryOk;
}

/**
 * How many steps (starting from step 1) are unlocked for display —
 * walks front-to-back, stops at the first incomplete step. The
 * current incomplete step still counts as "unlocked" (it's the active
 * one the learner is working toward); everything after it is locked.
 * An empty quest (no steps) has nothing to unlock.
 *
 * This is a DISPLAY/UX concept only — see `QuestStep`'s doc comment
 * in schema.prisma. It does not gate `Attempt` creation, so a learner
 * can satisfy a later step's raw condition before an earlier one; see
 * `isQuestComplete` for how completion is actually determined.
 */
export function unlockedStepCount(stepCompletions: boolean[]): number {
  if (stepCompletions.length === 0) return 0;

  const firstIncompleteIndex = stepCompletions.findIndex((complete) => !complete);
  if (firstIncompleteIndex === -1) {
    return stepCompletions.length;
  }
  return Math.min(firstIncompleteIndex + 1, stepCompletions.length);
}

/**
 * A quest is complete when EVERY step's own gate condition holds,
 * independent of the order in which they became true (see
 * `unlockedStepCount`'s doc comment for why order isn't enforceable
 * here). An empty quest is never "complete" — there's nothing to
 * reward.
 */
export function isQuestComplete(stepCompletions: boolean[]): boolean {
  return stepCompletions.length > 0 && stepCompletions.every(Boolean);
}
