"use client";

import { FormEvent, useState } from "react";
import { Button, Input, Select, Tag } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { QuestionOption, QuestionPayload, QuestionType } from "@/lib/api";

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_text: "Short text",
  numeric: "Numeric",
};

const TYPE_ORDER: QuestionType[] = ["single_choice", "multiple_choice", "true_false", "short_text", "numeric"];

let optionIdCounter = 0;
function newOptionId(): string {
  optionIdCounter += 1;
  return `opt-${Date.now()}-${optionIdCounter}`;
}

export interface QuestionFormValue {
  type: QuestionType;
  prompt: string;
  points: string;
  hint: string;
  explanation: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  trueFalseAnswer: boolean;
  acceptedAnswers: string[];
  numericValue: string;
  numericTolerance: string;
}

export function emptyQuestionFormValue(): QuestionFormValue {
  return {
    type: "single_choice",
    prompt: "",
    points: "1",
    hint: "",
    explanation: "",
    options: [
      { id: newOptionId(), text: "" },
      { id: newOptionId(), text: "" },
    ],
    correctOptionIds: [],
    trueFalseAnswer: true,
    acceptedAnswers: [],
    numericValue: "",
    numericTolerance: "",
  };
}

export function questionFormValueFrom(payload: QuestionPayload): QuestionFormValue {
  const base = emptyQuestionFormValue();
  base.type = payload.type;
  base.prompt = payload.prompt;
  base.points = String(payload.points ?? 1);
  base.hint = payload.hint ?? "";
  base.explanation = payload.explanation ?? "";

  if (payload.type === "single_choice" || payload.type === "multiple_choice") {
    base.options = payload.options && payload.options.length > 0 ? payload.options : base.options;
    base.correctOptionIds =
      payload.type === "single_choice"
        ? [payload.correctAnswer as string]
        : (payload.correctAnswer as string[]);
  } else if (payload.type === "true_false") {
    base.trueFalseAnswer = payload.correctAnswer as boolean;
  } else if (payload.type === "short_text") {
    base.acceptedAnswers = payload.correctAnswer as string[];
  } else if (payload.type === "numeric") {
    const answer = payload.correctAnswer as { value: number; tolerance?: number };
    base.numericValue = String(answer.value);
    base.numericTolerance = answer.tolerance !== undefined ? String(answer.tolerance) : "";
  }

  return base;
}

/**
 * Client-side validation mirroring the server's per-type correctAnswer
 * constraint (see apps/api's QuestionPayloadDto) so a bad submission
 * never round-trips just to learn the answer key is malformed.
 */
export function validateQuestionForm(value: QuestionFormValue): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!value.prompt.trim()) {
    errors.prompt = "Prompt is required.";
  }

  const points = Number(value.points);
  if (!Number.isInteger(points) || points < 1) {
    errors.points = "Points must be a whole number of at least 1.";
  }

  if (value.type === "single_choice" || value.type === "multiple_choice") {
    const filled = value.options.filter((o) => o.text.trim().length > 0);
    if (filled.length < 2) {
      errors.options = "Add at least 2 options.";
    }
    if (value.correctOptionIds.length === 0) {
      errors.correctAnswer = "Mark at least one option as correct.";
    }
  }

  if (value.type === "short_text" && value.acceptedAnswers.length === 0) {
    errors.correctAnswer = "Add at least one accepted answer.";
  }

  if (value.type === "numeric") {
    if (value.numericValue.trim() === "" || Number.isNaN(Number(value.numericValue))) {
      errors.correctAnswer = "Enter the correct numeric value.";
    }
    if (value.numericTolerance.trim() !== "" && Number.isNaN(Number(value.numericTolerance))) {
      errors.numericTolerance = "Tolerance must be a number.";
    }
  }

  return errors;
}

export function toQuestionPayload(value: QuestionFormValue): QuestionPayload {
  const base = {
    type: value.type,
    prompt: value.prompt.trim(),
    points: Number(value.points) || 1,
    hint: value.hint.trim() || undefined,
    explanation: value.explanation.trim() || undefined,
  };

  if (value.type === "single_choice") {
    return {
      ...base,
      options: value.options.filter((o) => o.text.trim().length > 0),
      correctAnswer: value.correctOptionIds[0] ?? "",
    };
  }

  if (value.type === "multiple_choice") {
    return {
      ...base,
      options: value.options.filter((o) => o.text.trim().length > 0),
      correctAnswer: value.correctOptionIds,
    };
  }

  if (value.type === "true_false") {
    return { ...base, correctAnswer: value.trueFalseAnswer };
  }

  if (value.type === "short_text") {
    return { ...base, correctAnswer: value.acceptedAnswers };
  }

  return {
    ...base,
    correctAnswer: {
      value: Number(value.numericValue),
      tolerance: value.numericTolerance.trim() !== "" ? Number(value.numericTolerance) : undefined,
    },
  };
}

export function QuestionForm({
  value,
  onChange,
  errors,
  onSubmit,
  submitting,
  submitLabel,
}: {
  value: QuestionFormValue;
  onChange: (value: QuestionFormValue) => void;
  errors: Record<string, string>;
  onSubmit: (event: FormEvent) => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [acceptedDraft, setAcceptedDraft] = useState("");

  function set<K extends keyof QuestionFormValue>(key: K, val: QuestionFormValue[K]) {
    onChange({ ...value, [key]: val });
  }

  function onTypeChange(label: string) {
    const type = TYPE_ORDER.find((t) => TYPE_LABELS[t] === label) ?? "single_choice";
    onChange({ ...emptyQuestionFormValue(), type, prompt: value.prompt, points: value.points });
  }

  function setOptionText(id: string, text: string) {
    set(
      "options",
      value.options.map((o) => (o.id === id ? { ...o, text } : o)),
    );
  }

  function addOption() {
    set("options", [...value.options, { id: newOptionId(), text: "" }]);
  }

  function removeOption(id: string) {
    set(
      "options",
      value.options.filter((o) => o.id !== id),
    );
    set(
      "correctOptionIds",
      value.correctOptionIds.filter((c) => c !== id),
    );
  }

  function toggleCorrect(id: string) {
    if (value.type === "single_choice") {
      set("correctOptionIds", [id]);
    } else {
      const has = value.correctOptionIds.includes(id);
      set("correctOptionIds", has ? value.correctOptionIds.filter((c) => c !== id) : [...value.correctOptionIds, id]);
    }
  }

  function addAcceptedAnswer() {
    const trimmed = acceptedDraft.trim();
    if (!trimmed) return;
    if (!value.acceptedAnswers.includes(trimmed)) {
      set("acceptedAnswers", [...value.acceptedAnswers, trimmed]);
    }
    setAcceptedDraft("");
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormField label="Question type" htmlFor="question-type">
        <Select options={TYPE_ORDER.map((t) => TYPE_LABELS[t])} value={TYPE_LABELS[value.type]} onChange={onTypeChange} />
      </FormField>

      <FormField label="Prompt" htmlFor="prompt" error={errors.prompt}>
        <Input id="prompt" multiline rows={3} value={value.prompt} onChange={(v) => set("prompt", v)} placeholder="What is the boiling point of water at sea level, in Celsius?" />
      </FormField>

      <FormField label="Points" htmlFor="points" error={errors.points}>
        <Input id="points" type="number" value={value.points} onChange={(v) => set("points", v)} />
      </FormField>

      {(value.type === "single_choice" || value.type === "multiple_choice") && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: "var(--fw-medium)", marginBottom: 6 }}>
            Options {value.type === "single_choice" ? "(select one correct answer)" : "(select all correct answers)"}
          </label>
          {value.options.map((option, index) => (
            <div key={option.id} data-testid="option-row" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input
                type={value.type === "single_choice" ? "radio" : "checkbox"}
                name="correct-option"
                aria-label={`Option ${index + 1} is correct`}
                checked={value.correctOptionIds.includes(option.id)}
                onChange={() => toggleCorrect(option.id)}
              />
              <div style={{ flex: 1 }}>
                <Input value={option.text} onChange={(v) => setOptionText(option.id, v)} placeholder={`Option ${index + 1}`} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(option.id)}>
                Remove
              </Button>
            </div>
          ))}
          {errors.options && (
            <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 12 }}>
              {errors.options}
            </p>
          )}
          {errors.correctAnswer && (
            <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 12 }}>
              {errors.correctAnswer}
            </p>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addOption}>
            Add option
          </Button>
        </div>
      )}

      {value.type === "true_false" && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: "var(--fw-medium)", marginBottom: 6 }}>Correct answer</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="true-false" checked={value.trueFalseAnswer === true} onChange={() => set("trueFalseAnswer", true)} />
              True
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name="true-false" checked={value.trueFalseAnswer === false} onChange={() => set("trueFalseAnswer", false)} />
              False
            </label>
          </div>
        </div>
      )}

      {value.type === "short_text" && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: "var(--fw-medium)", marginBottom: 6 }}>Accepted answers</label>
          <div data-testid="accepted-answers" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {value.acceptedAnswers.map((answer) => (
              <Tag key={answer} onRemove={() => set("acceptedAnswers", value.acceptedAnswers.filter((a) => a !== answer))}>
                {answer}
              </Tag>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={acceptedDraft}
              onChange={setAcceptedDraft}
              placeholder="Type an accepted answer and press Enter"
              id="accepted-answer-draft"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addAcceptedAnswer}
            >
              Add
            </Button>
          </div>
          {errors.correctAnswer && (
            <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 12, marginTop: 6 }}>
              {errors.correctAnswer}
            </p>
          )}
        </div>
      )}

      {value.type === "numeric" && (
        <>
          <FormField label="Correct value" htmlFor="numeric-value" error={errors.correctAnswer}>
            <Input id="numeric-value" type="number" value={value.numericValue} onChange={(v) => set("numericValue", v)} />
          </FormField>
          <FormField label="Tolerance (optional)" htmlFor="numeric-tolerance" error={errors.numericTolerance}>
            <Input id="numeric-tolerance" type="number" value={value.numericTolerance} onChange={(v) => set("numericTolerance", v)} />
          </FormField>
        </>
      )}

      <FormField label="Hint (optional)" htmlFor="hint">
        <Input id="hint" value={value.hint} onChange={(v) => set("hint", v)} />
      </FormField>

      <FormField label="Explanation (optional)" htmlFor="explanation">
        <Input id="explanation" multiline rows={2} value={value.explanation} onChange={(v) => set("explanation", v)} />
      </FormField>

      <Button type="submit" variant="primary" size="lg" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
