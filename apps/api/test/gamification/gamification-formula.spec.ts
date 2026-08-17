import {
  ATTEMPT_COMPLETION_XP,
  LEVEL_XP_COEFFICIENT,
  XP_PER_POINT,
  levelForXp,
  xpForAttempt,
  xpRequiredForLevel,
} from "../../src/gamification/gamification-formula";

describe("gamification formula (unit)", () => {
  it("constants match the locked spec values", () => {
    expect(XP_PER_POINT).toBe(10);
    expect(ATTEMPT_COMPLETION_XP).toBe(20);
    expect(LEVEL_XP_COEFFICIENT).toBe(50);
  });

  describe("xpForAttempt", () => {
    it("zero points awarded still gives the flat completion XP", () => {
      expect(xpForAttempt(0)).toBe(20);
    });

    it("whole points: completion XP plus 10 per point", () => {
      // 20 + round(3 * 10) = 50
      expect(xpForAttempt(3)).toBe(50);
    });

    it("fractional points: rounds the points*10 term", () => {
      // 20 + round(2.5 * 10) = 20 + 25 = 45
      expect(xpForAttempt(2.5)).toBe(45);
      // 20 + round(2.34 * 10) = 20 + round(23.4) = 20 + 23 = 43
      expect(xpForAttempt(2.34)).toBe(43);
    });

    it("large point totals scale linearly", () => {
      expect(xpForAttempt(10)).toBe(120);
    });
  });

  describe("xpRequiredForLevel", () => {
    it("matches the documented thresholds for levels 1-6", () => {
      expect(xpRequiredForLevel(1)).toBe(0);
      expect(xpRequiredForLevel(2)).toBe(100);
      expect(xpRequiredForLevel(3)).toBe(300);
      expect(xpRequiredForLevel(4)).toBe(600);
      expect(xpRequiredForLevel(5)).toBe(1000);
      expect(xpRequiredForLevel(6)).toBe(1500);
    });
  });

  describe("levelForXp", () => {
    it("zero XP is level 1 with a full level-2 bar ahead", () => {
      const progress = levelForXp(0);
      expect(progress.level).toBe(1);
      expect(progress.xpIntoLevel).toBe(0);
      expect(progress.xpForNextLevel).toBe(100);
    });

    it("XP exactly on a threshold counts as having reached that level (>=, not >)", () => {
      const progress = levelForXp(300);
      expect(progress.level).toBe(3);
      expect(progress.xpIntoLevel).toBe(0);
      expect(progress.xpForNextLevel).toBe(300); // level 4 requires 600, level 3 requires 300 -> 300
    });

    it("XP between thresholds resolves to the lower level with partial progress", () => {
      // Between level 2 (100) and level 3 (300): 150 -> level 2, 50 into it, 200 needed for level 3.
      const progress = levelForXp(150);
      expect(progress.level).toBe(2);
      expect(progress.xpIntoLevel).toBe(50);
      expect(progress.xpForNextLevel).toBe(200);
    });

    it("one XP short of a threshold stays at the lower level", () => {
      const progress = levelForXp(299);
      expect(progress.level).toBe(2);
    });

    it("large XP totals climb multiple levels correctly", () => {
      const progress = levelForXp(1000);
      expect(progress.level).toBe(5);
      expect(progress.xpIntoLevel).toBe(0);
    });
  });
});
