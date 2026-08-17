import {
  HINT_PENALTY_MULTIPLIER,
  RECENCY_HALF_LIFE_DAYS,
  effectiveResponseScore,
  recencyWeight,
  weightedMasteryScore,
  stateForScore,
} from "../../src/mastery/mastery-formula";

describe("mastery formula (unit)", () => {
  it("constants match the locked spec values", () => {
    expect(HINT_PENALTY_MULTIPLIER).toBe(0.85);
    expect(RECENCY_HALF_LIFE_DAYS).toBe(14);
  });

  describe("effectiveResponseScore", () => {
    it("no hint viewed: fraction passes through unchanged", () => {
      // 3/4 = 0.75, no penalty
      expect(effectiveResponseScore(3, 4, false)).toBeCloseTo(0.75);
    });

    it("hint viewed: applies the 0.85 multiplier", () => {
      // 3/4 = 0.75 * 0.85 = 0.6375
      expect(effectiveResponseScore(3, 4, true)).toBeCloseTo(0.6375);
    });

    it("full credit with hint viewed: 1.0 * 0.85 = 0.85", () => {
      expect(effectiveResponseScore(4, 4, true)).toBeCloseTo(0.85);
    });

    it("zero credit is unaffected by the hint multiplier", () => {
      expect(effectiveResponseScore(0, 4, true)).toBe(0);
    });
  });

  describe("recencyWeight", () => {
    it("zero days since recorded: weight is exactly 1", () => {
      expect(recencyWeight(0)).toBe(1);
    });

    it("one half-life (14 days) elapsed: weight is exactly 0.5", () => {
      expect(recencyWeight(14)).toBeCloseTo(0.5);
    });

    it("two half-lives (28 days) elapsed: weight is exactly 0.25", () => {
      expect(recencyWeight(28)).toBeCloseTo(0.25);
    });
  });

  describe("weightedMasteryScore", () => {
    it("empty evidence returns null (caller surfaces this as not_started)", () => {
      expect(weightedMasteryScore([])).toBeNull();
    });

    it("single evidence row without hint: score equals its effective score, regardless of recency", () => {
      // Hand-computed: a single point's weighted average is always
      // itself, since weight cancels out of a one-term ratio.
      const score = weightedMasteryScore([{ effectiveResponseScore: 0.75, daysSinceRecorded: 5 }]);
      expect(score).toBeCloseTo(0.75);
    });

    it("single evidence row with hint applied upstream: score reflects the penalized value", () => {
      const effective = effectiveResponseScore(4, 4, true); // 0.85
      const score = weightedMasteryScore([{ effectiveResponseScore: effective, daysSinceRecorded: 0 }]);
      expect(score).toBeCloseTo(0.85);
    });

    it("two evidence rows at different recency combine via the recency-weighted average", () => {
      // Hand-computed:
      //   point A: effective=1.0, days=0    -> weight = 0.5^(0/14)  = 1
      //   point B: effective=0.0, days=14   -> weight = 0.5^(14/14) = 0.5
      //   weighted sum = 1.0*1 + 0.0*0.5 = 1.0
      //   weight sum   = 1 + 0.5 = 1.5
      //   score = 1.0 / 1.5 = 0.6666...
      const score = weightedMasteryScore([
        { effectiveResponseScore: 1.0, daysSinceRecorded: 0 },
        { effectiveResponseScore: 0.0, daysSinceRecorded: 14 },
      ]);
      expect(score).toBeCloseTo(2 / 3, 6);
    });

    it("three evidence rows at 0/14/28 days combine via the recency-weighted average", () => {
      // Hand-computed:
      //   A: effective=1.0, days=0  -> weight = 1
      //   B: effective=0.5, days=14 -> weight = 0.5
      //   C: effective=0.0, days=28 -> weight = 0.25
      //   weighted sum = 1.0*1 + 0.5*0.5 + 0.0*0.25 = 1.25
      //   weight sum   = 1 + 0.5 + 0.25 = 1.75
      //   score = 1.25 / 1.75 = 0.714285714...
      const score = weightedMasteryScore([
        { effectiveResponseScore: 1.0, daysSinceRecorded: 0 },
        { effectiveResponseScore: 0.5, daysSinceRecorded: 14 },
        { effectiveResponseScore: 0.0, daysSinceRecorded: 28 },
      ]);
      expect(score).toBeCloseTo(1.25 / 1.75, 6);
    });
  });

  describe("stateForScore — boundary cutoffs", () => {
    it("0.39 resolves to beginning, 0.40 resolves to developing", () => {
      expect(stateForScore(0.39)).toBe("beginning");
      expect(stateForScore(0.4)).toBe("developing");
    });

    it("0.69 resolves to developing, 0.70 resolves to proficient", () => {
      expect(stateForScore(0.69)).toBe("developing");
      expect(stateForScore(0.7)).toBe("proficient");
    });

    it("0.89 resolves to proficient, 0.90 resolves to mastered", () => {
      expect(stateForScore(0.89)).toBe("proficient");
      expect(stateForScore(0.9)).toBe("mastered");
    });

    it("0 resolves to beginning, 1.0 resolves to mastered", () => {
      expect(stateForScore(0)).toBe("beginning");
      expect(stateForScore(1)).toBe("mastered");
    });
  });
});
