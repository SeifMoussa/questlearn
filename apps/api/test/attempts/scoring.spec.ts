import { scoreQuestion, overallScore } from "../../src/attempts/scoring";

describe("scoreQuestion (unit)", () => {
  describe("multiple_choice — real partial credit", () => {
    const options = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const correctAnswer = ["a", "b"]; // total_correct = 2, total_incorrect = 2 (c, d)

    it("full credit: exactly the correct set selected", () => {
      const result = scoreQuestion({ type: "multiple_choice", points: 4, options, correctAnswer }, ["a", "b"]);
      // fraction = 2/2 - 0/2 = 1
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(4);
      expect(result.isCorrect).toBe(true);
    });

    it("partial credit: one correct selected, no incorrect", () => {
      const result = scoreQuestion({ type: "multiple_choice", points: 4, options, correctAnswer }, ["a"]);
      // fraction = 1/2 - 0/2 = 0.5
      expect(result.fraction).toBeCloseTo(0.5);
      expect(result.pointsAwarded).toBeCloseTo(2);
      expect(result.isCorrect).toBe(false);
    });

    it("partial credit: one correct selected, one incorrect selected", () => {
      const result = scoreQuestion({ type: "multiple_choice", points: 4, options, correctAnswer }, ["a", "c"]);
      // fraction = 1/2 - 1/2 = 0
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });

    it("negative raw score clamps to floor 0: all incorrect selected", () => {
      const result = scoreQuestion({ type: "multiple_choice", points: 4, options, correctAnswer }, ["c", "d"]);
      // fraction = 0/2 - 2/2 = -1, clamped to 0
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });

    it("ceiling clamps at 1 even if raw score would exceed it", () => {
      // total_correct=1, total_incorrect=3; selecting the one correct
      // option alone already reaches fraction 1 — confirms the ceiling
      // holds rather than the formula ever exceeding 1.
      const singleCorrectOptions = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
      const result = scoreQuestion(
        { type: "multiple_choice", points: 10, options: singleCorrectOptions, correctAnswer: ["a"] },
        ["a"],
      );
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(10);
    });

    it("empty response scores zero, not an error", () => {
      const result = scoreQuestion({ type: "multiple_choice", points: 4, options, correctAnswer }, []);
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });
  });

  describe("single_choice — degenerates to binary", () => {
    const options = [{ id: "a" }, { id: "b" }, { id: "c" }];

    it("correct selection scores full credit", () => {
      const result = scoreQuestion({ type: "single_choice", points: 2, options, correctAnswer: "b" }, "b");
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(2);
      expect(result.isCorrect).toBe(true);
    });

    it("incorrect selection scores zero (clamped from negative)", () => {
      const result = scoreQuestion({ type: "single_choice", points: 2, options, correctAnswer: "b" }, "a");
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
      expect(result.isCorrect).toBe(false);
    });

    it("no selection scores zero", () => {
      const result = scoreQuestion({ type: "single_choice", points: 2, options, correctAnswer: "b" }, null);
      expect(result.fraction).toBe(0);
    });
  });

  describe("true_false — degenerates to binary", () => {
    it("matching boolean scores full credit", () => {
      const result = scoreQuestion({ type: "true_false", points: 1, correctAnswer: true }, true);
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(1);
    });

    it("mismatched boolean scores zero", () => {
      const result = scoreQuestion({ type: "true_false", points: 1, correctAnswer: true }, false);
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });
  });

  describe("short_text — degenerates to binary", () => {
    const correctAnswer = ["Paris", "paris, france"];

    it("case-insensitive, trimmed match scores full credit", () => {
      const result = scoreQuestion({ type: "short_text", points: 3, correctAnswer }, "  PARIS  ");
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(3);
    });

    it("non-match scores zero", () => {
      const result = scoreQuestion({ type: "short_text", points: 3, correctAnswer }, "London");
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });

    it("empty response scores zero, not an error", () => {
      const result = scoreQuestion({ type: "short_text", points: 3, correctAnswer }, "");
      expect(result.fraction).toBe(0);
    });
  });

  describe("numeric — degenerates to binary, tolerance aware", () => {
    it("exact match scores full credit", () => {
      const result = scoreQuestion({ type: "numeric", points: 5, correctAnswer: { value: 42 } }, 42);
      expect(result.fraction).toBe(1);
      expect(result.pointsAwarded).toBe(5);
    });

    it("within tolerance scores full credit", () => {
      const result = scoreQuestion({ type: "numeric", points: 5, correctAnswer: { value: 42, tolerance: 0.5 } }, 42.4);
      expect(result.fraction).toBe(1);
    });

    it("outside tolerance scores zero", () => {
      const result = scoreQuestion({ type: "numeric", points: 5, correctAnswer: { value: 42, tolerance: 0.5 } }, 43);
      expect(result.fraction).toBe(0);
      expect(result.pointsAwarded).toBe(0);
    });
  });
});

describe("overallScore (unit)", () => {
  it("sums pointsAwarded over sums of points", () => {
    const score = overallScore([
      { pointsAwarded: 2, points: 4 },
      { pointsAwarded: 1, points: 1 },
      { pointsAwarded: 0, points: 5 },
    ]);
    // (2 + 1 + 0) / (4 + 1 + 5) = 3/10 = 0.3
    expect(score).toBeCloseTo(0.3);
  });

  it("clamps to 1 ceiling defensively", () => {
    const score = overallScore([{ pointsAwarded: 10, points: 5 }]);
    expect(score).toBe(1);
  });

  it("returns 0 for an attempt with zero total points rather than dividing by zero", () => {
    const score = overallScore([]);
    expect(score).toBe(0);
  });
});
