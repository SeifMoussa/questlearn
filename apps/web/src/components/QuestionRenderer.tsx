"use client";

/**
 * Renders a question either read-only (learner-style, no answer-key
 * emphasis — the original Module 3/4 behavior) or interactively (a
 * real attempt in progress, Module 5). One component with a mode
 * toggle rather than two parallel components, so every question-type
 * branch (single_choice/multiple_choice/true_false/short_text/numeric)
 * is only implemented once. Passing `value`/`onChange` switches a
 * question into interactive mode; omitting them keeps the original
 * disabled/read-only rendering used by `/questions/[id]` preview and
 * `/activities/[id]/preview`.
 *
 * This is still a rendering-fidelity choice, not an enforced security
 * boundary on its own — the real answer-key protection is server-side
 * (apps/api's AttemptsService strips `correctAnswer` pre-submit); this
 * component just never has anything to leak in interactive mode since
 * the attempt-player page never fetches `correctAnswer` before submit.
 */

export interface RenderableQuestion {
  type: "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric";
  prompt: string;
  hint?: string | null;
  options?: { id: string; text: string }[] | null;
}

interface QuestionRendererProps {
  question: RenderableQuestion;
  value?: unknown;
  onChange?: (value: unknown) => void;
}

export function QuestionRenderer({ question, value, onChange }: QuestionRendererProps) {
  const v = question;
  const interactive = onChange !== undefined;

  return (
    <div data-testid="learner-preview" style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>{v.prompt}</p>

      {v.type === "single_choice" && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(v.options ?? []).map((option) => (
            <li key={option.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <input
                type="radio"
                disabled={!interactive}
                readOnly={!interactive}
                checked={interactive ? value === option.id : undefined}
                onChange={interactive ? () => onChange!(option.id) : undefined}
                data-testid="option-input"
              />
              <span>{option.text}</span>
            </li>
          ))}
        </ul>
      )}

      {v.type === "multiple_choice" && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(v.options ?? []).map((option) => {
            const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
            return (
              <li key={option.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                <input
                  type="checkbox"
                  disabled={!interactive}
                  readOnly={!interactive}
                  checked={interactive ? selected.has(option.id) : undefined}
                  onChange={
                    interactive
                      ? () => {
                          const next = new Set(selected);
                          if (next.has(option.id)) next.delete(option.id);
                          else next.add(option.id);
                          onChange!(Array.from(next));
                        }
                      : undefined
                  }
                  data-testid="option-input"
                />
                <span>{option.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {v.type === "true_false" && (
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="radio"
              disabled={!interactive}
              readOnly={!interactive}
              checked={interactive ? value === true : undefined}
              onChange={interactive ? () => onChange!(true) : undefined}
              data-testid="true-input"
            />{" "}
            True
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="radio"
              disabled={!interactive}
              readOnly={!interactive}
              checked={interactive ? value === false : undefined}
              onChange={interactive ? () => onChange!(false) : undefined}
              data-testid="false-input"
            />{" "}
            False
          </label>
        </div>
      )}

      {v.type === "short_text" && (
        <input
          type="text"
          disabled={!interactive}
          readOnly={!interactive}
          value={interactive ? (typeof value === "string" ? value : "") : undefined}
          onChange={interactive ? (e) => onChange!(e.target.value) : undefined}
          placeholder="Type your answer"
          data-testid="short-text-input"
          style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}
        />
      )}

      {v.type === "numeric" && (
        <input
          type="number"
          disabled={!interactive}
          readOnly={!interactive}
          value={interactive ? (typeof value === "number" ? value : "") : undefined}
          onChange={interactive ? (e) => onChange!(e.target.value === "" ? null : Number(e.target.value)) : undefined}
          placeholder="Enter a number"
          data-testid="numeric-input"
          style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}
        />
      )}

      {v.hint && <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)" }}>Hint: {v.hint}</p>}
    </div>
  );
}
