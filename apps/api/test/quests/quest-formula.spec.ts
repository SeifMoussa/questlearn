import {
  QUEST_COMPLETION_BASE_XP,
  QUEST_COMPLETION_XP_PER_STEP,
  isQuestComplete,
  isStepComplete,
  meetsMasteryThreshold,
  unlockedStepCount,
  xpForQuestCompletion,
} from "../../src/quests/quest-formula";

describe("quest formula (unit)", () => {
  it("constants match the locked design values", () => {
    expect(QUEST_COMPLETION_BASE_XP).toBe(50);
    expect(QUEST_COMPLETION_XP_PER_STEP).toBe(10);
  });

  describe("xpForQuestCompletion", () => {
    it("a 3-step quest pays 50 + 10*3 = 80", () => {
      expect(xpForQuestCompletion(3)).toBe(80);
    });

    it("a 0-step edge case still returns the flat base (validated unreachable elsewhere)", () => {
      expect(xpForQuestCompletion(0)).toBe(50);
    });
  });

  describe("meetsMasteryThreshold", () => {
    it("exact match meets the threshold", () => {
      expect(meetsMasteryThreshold("proficient", "proficient")).toBe(true);
    });

    it("higher actual state meets a lower required threshold", () => {
      expect(meetsMasteryThreshold("mastered", "developing")).toBe(true);
    });

    it("lower actual state does not meet a higher required threshold", () => {
      expect(meetsMasteryThreshold("beginning", "mastered")).toBe(false);
    });

    it("not_started never meets any real threshold", () => {
      expect(meetsMasteryThreshold("not_started", "beginning")).toBe(false);
    });
  });

  describe("isStepComplete", () => {
    it("activity-only step: mastery gate absent (null) never blocks it", () => {
      expect(isStepComplete({ activityGateSatisfied: true, masteryGateSatisfied: null })).toBe(true);
      expect(isStepComplete({ activityGateSatisfied: false, masteryGateSatisfied: null })).toBe(false);
    });

    it("mastery-only step: activity gate absent (null) never blocks it", () => {
      expect(isStepComplete({ activityGateSatisfied: null, masteryGateSatisfied: true })).toBe(true);
      expect(isStepComplete({ activityGateSatisfied: null, masteryGateSatisfied: false })).toBe(false);
    });

    it("combined step requires BOTH gates (AND, not OR)", () => {
      expect(isStepComplete({ activityGateSatisfied: true, masteryGateSatisfied: true })).toBe(true);
      expect(isStepComplete({ activityGateSatisfied: true, masteryGateSatisfied: false })).toBe(false);
      expect(isStepComplete({ activityGateSatisfied: false, masteryGateSatisfied: true })).toBe(false);
      expect(isStepComplete({ activityGateSatisfied: false, masteryGateSatisfied: false })).toBe(false);
    });
  });

  describe("unlockedStepCount", () => {
    it("empty quest unlocks nothing", () => {
      expect(unlockedStepCount([])).toBe(0);
    });

    it("first step incomplete: only step 1 unlocked (as the active step)", () => {
      expect(unlockedStepCount([false, false, false])).toBe(1);
    });

    it("stops at the first incomplete step, counting it as unlocked", () => {
      expect(unlockedStepCount([true, false, true])).toBe(2);
    });

    it("all complete: every step unlocked", () => {
      expect(unlockedStepCount([true, true, true])).toBe(3);
    });
  });

  describe("isQuestComplete", () => {
    it("empty quest is never complete", () => {
      expect(isQuestComplete([])).toBe(false);
    });

    it("false if any step is incomplete, regardless of position", () => {
      expect(isQuestComplete([true, true, false])).toBe(false);
      expect(isQuestComplete([false, true, true])).toBe(false);
    });

    it("true only when every step is complete", () => {
      expect(isQuestComplete([true, true, true])).toBe(true);
    });
  });
});
