import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreateQuestionDto } from "../../src/questions/dto/question-payload.dto";

/**
 * Proves malformed correctAnswer/options shapes are rejected per
 * question type, not just accepted on a happy path. Covers all five
 * locked question types.
 */
describe("CreateQuestionDto per-type validation", () => {
  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateQuestionDto, payload);
    return validate(dto);
  }

  it("accepts a well-formed single_choice question", async () => {
    const errors = await errorsFor({
      type: "single_choice",
      prompt: "What is 2 + 2?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4" },
      ],
      correctAnswer: "b",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects single_choice when correctAnswer isn't one of the option ids", async () => {
    const errors = await errorsFor({
      type: "single_choice",
      prompt: "What is 2 + 2?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4" },
      ],
      correctAnswer: "c",
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("rejects single_choice with fewer than 2 options", async () => {
    const errors = await errorsFor({
      type: "single_choice",
      prompt: "What is 2 + 2?",
      options: [{ id: "a", text: "4" }],
      correctAnswer: "a",
    });
    expect(errors.some((e) => e.property === "options")).toBe(true);
  });

  it("accepts a well-formed multiple_choice question", async () => {
    const errors = await errorsFor({
      type: "multiple_choice",
      prompt: "Which are primes?",
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "3" },
        { id: "c", text: "4" },
      ],
      correctAnswer: ["a", "b"],
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects multiple_choice when correctAnswer isn't an array of option ids", async () => {
    const errors = await errorsFor({
      type: "multiple_choice",
      prompt: "Which are primes?",
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "3" },
      ],
      correctAnswer: "a",
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("rejects multiple_choice with an empty correctAnswer array", async () => {
    const errors = await errorsFor({
      type: "multiple_choice",
      prompt: "Which are primes?",
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "3" },
      ],
      correctAnswer: [],
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("accepts a well-formed true_false question", async () => {
    const errors = await errorsFor({
      type: "true_false",
      prompt: "The sky is blue.",
      correctAnswer: true,
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects true_false when correctAnswer isn't a boolean", async () => {
    const errors = await errorsFor({
      type: "true_false",
      prompt: "The sky is blue.",
      correctAnswer: "true",
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("accepts a well-formed short_text question", async () => {
    const errors = await errorsFor({
      type: "short_text",
      prompt: "Name a primary color.",
      correctAnswer: ["red", "blue", "yellow"],
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects short_text with an empty accepted-answers array", async () => {
    const errors = await errorsFor({
      type: "short_text",
      prompt: "Name a primary color.",
      correctAnswer: [],
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("rejects short_text when correctAnswer contains a non-string", async () => {
    const errors = await errorsFor({
      type: "short_text",
      prompt: "Name a primary color.",
      correctAnswer: ["red", 5],
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("accepts a well-formed numeric question", async () => {
    const errors = await errorsFor({
      type: "numeric",
      prompt: "What is the boiling point of water in Celsius?",
      correctAnswer: { value: 100, tolerance: 1 },
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects numeric when correctAnswer.value isn't a number", async () => {
    const errors = await errorsFor({
      type: "numeric",
      prompt: "What is the boiling point of water in Celsius?",
      correctAnswer: { value: "100" },
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("rejects numeric with a negative tolerance", async () => {
    const errors = await errorsFor({
      type: "numeric",
      prompt: "What is the boiling point of water in Celsius?",
      correctAnswer: { value: 100, tolerance: -1 },
    });
    expect(errors.some((e) => e.property === "correctAnswer")).toBe(true);
  });

  it("rejects an empty prompt regardless of type", async () => {
    const errors = await errorsFor({
      type: "true_false",
      prompt: "",
      correctAnswer: true,
    });
    expect(errors.some((e) => e.property === "prompt")).toBe(true);
  });

  it("rejects an unsupported question type", async () => {
    const errors = await errorsFor({
      type: "matching",
      prompt: "Match the pairs.",
      correctAnswer: {},
    });
    expect(errors.some((e) => e.property === "type")).toBe(true);
  });
});
