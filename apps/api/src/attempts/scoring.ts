import { QuestionType } from "@prisma/client";

export interface ScorableQuestion {
  type: QuestionType;
  points: number;
  options?: unknown;
  correctAnswer: unknown;
}

export interface QuestionScore {
  fraction: number;
  pointsAwarded: number;
  isCorrect: boolean;
}

interface QuestionOption {
  id: string;
  text?: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Generic partial-credit formula (Master Spec §6.6):
 *
 *   fraction = correct/total_correct - incorrect/total_incorrect
 *
 * floored at 0, ceilinged at 1. Every question type is expressed as a
 * "correct set" vs "incorrect universe" of identifiers and a
 * "selected set" derived from the learner's response — the SAME
 * function computes all five types below, rather than branching into
 * per-type scoring logic. `multiple_choice` is the only type where
 * these sets can have more than one member, which is what produces
 * real partial credit; every other type has |correctSet| = 1 and
 * |incorrectUniverse| = 1 (or options.length - 1 for single_choice),
 * so the same math degenerates to binary 0/1.
 */
function fractionFromSets(
  correctSet: Set<string>,
  incorrectUniverseSize: number,
  selectedSet: Set<string>,
): number {
  const totalCorrect = correctSet.size || 1; // guard: a malformed question never divides by zero
  let correctSelected = 0;
  let incorrectSelected = 0;
  for (const s of selectedSet) {
    if (correctSet.has(s)) correctSelected++;
    else incorrectSelected++;
  }

  const correctTerm = correctSelected / totalCorrect;
  const incorrectTerm = incorrectUniverseSize > 0 ? incorrectSelected / incorrectUniverseSize : 0;
  return clamp01(correctTerm - incorrectTerm);
}

function computeFraction(question: ScorableQuestion, responseValue: unknown): number {
  switch (question.type) {
    case "multiple_choice": {
      const options = (question.options as QuestionOption[] | null) ?? [];
      const correctIds = Array.isArray(question.correctAnswer) ? (question.correctAnswer as string[]) : [];
      const correctSet = new Set(correctIds);
      const incorrectUniverseSize = Math.max(options.length - correctSet.size, 0);
      const selectedIds = Array.isArray(responseValue) ? (responseValue as string[]) : [];
      const selectedSet = new Set(selectedIds);
      return fractionFromSets(correctSet, incorrectUniverseSize, selectedSet);
    }
    case "single_choice": {
      const options = (question.options as QuestionOption[] | null) ?? [];
      const correctId = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
      const correctSet = new Set([correctId]);
      const incorrectUniverseSize = Math.max(options.length - 1, 0);
      const selectedSet = new Set<string>(typeof responseValue === "string" && responseValue ? [responseValue] : []);
      return fractionFromSets(correctSet, incorrectUniverseSize, selectedSet);
    }
    case "true_false": {
      const correctSet = new Set([String(Boolean(question.correctAnswer))]);
      const selectedSet = new Set<string>(
        typeof responseValue === "boolean" ? [String(responseValue)] : [],
      );
      return fractionFromSets(correctSet, 1, selectedSet);
    }
    case "short_text": {
      const accepted = Array.isArray(question.correctAnswer) ? (question.correctAnswer as string[]) : [];
      const normalize = (s: string) => s.trim().toLowerCase();
      const acceptedNormalized = new Set(accepted.map(normalize));
      const response = typeof responseValue === "string" ? responseValue : "";
      const correctSet = new Set(["match"]);
      const selectedSet = new Set<string>();
      if (response.trim().length > 0) {
        selectedSet.add(acceptedNormalized.has(normalize(response)) ? "match" : "no-match");
      }
      return fractionFromSets(correctSet, 1, selectedSet);
    }
    case "numeric": {
      const answer = question.correctAnswer as { value: number; tolerance?: number } | null;
      const target = answer?.value;
      const tolerance = answer?.tolerance ?? 0;
      const correctSet = new Set(["match"]);
      const selectedSet = new Set<string>();
      if (typeof responseValue === "number" && typeof target === "number") {
        selectedSet.add(Math.abs(responseValue - target) <= tolerance ? "match" : "no-match");
      }
      return fractionFromSets(correctSet, 1, selectedSet);
    }
    default:
      return 0;
  }
}

export function scoreQuestion(question: ScorableQuestion, responseValue: unknown): QuestionScore {
  const fraction = computeFraction(question, responseValue);
  return {
    fraction,
    pointsAwarded: fraction * question.points,
    isCorrect: fraction >= 1,
  };
}

/**
 * The attempt's overall score = sum(pointsAwarded) / sum(points)
 * across all its questions, clamped to [0,1] (defensive — the
 * per-question fractions are already clamped, so this should never
 * exceed the range, but an attempt with zero total points would
 * otherwise divide by zero).
 */
export function overallScore(perQuestion: { pointsAwarded: number; points: number }[]): number {
  const totalPoints = perQuestion.reduce((sum, q) => sum + q.points, 0);
  if (totalPoints <= 0) return 0;
  const totalAwarded = perQuestion.reduce((sum, q) => sum + q.pointsAwarded, 0);
  return clamp01(totalAwarded / totalPoints);
}
