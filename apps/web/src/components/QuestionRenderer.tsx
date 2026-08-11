"use client";

/**
 * Renders a question the way a learner will see it — no visual
 * emphasis on which option/answer is correct. Shared by the
 * single-question preview (`/questions/[id]`) and the full-activity
 * preview (`/activities/[id]/preview`) so there is exactly one
 * implementation of "render a question learner-style with no
 * answer-key emphasis." This is a rendering-fidelity choice, not an
 * enforced security boundary — the underlying API responses still
 * carry the full answer key (see apps/api's QuestionsService/
 * ActivitiesService doc comments), since there's no learner-facing
 * submission surface to protect it from yet.
 */

export interface RenderableQuestion {
  type: "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric";
  prompt: string;
  hint?: string | null;
  options?: { id: string; text: string }[] | null;
}

export function QuestionRenderer({ question }: { question: RenderableQuestion }) {
  const v = question;

  return (
    <div data-testid="learner-preview" style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>{v.prompt}</p>

      {(v.type === "single_choice" || v.type === "multiple_choice") && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(v.options ?? []).map((option) => (
            <li key={option.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
              <input type={v.type === "single_choice" ? "radio" : "checkbox"} disabled readOnly />
              <span>{option.text}</span>
            </li>
          ))}
        </ul>
      )}

      {v.type === "true_false" && (
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" disabled readOnly /> True
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" disabled readOnly /> False
          </label>
        </div>
      )}

      {v.type === "short_text" && (
        <input
          type="text"
          disabled
          placeholder="Type your answer"
          style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}
        />
      )}

      {v.type === "numeric" && (
        <input
          type="number"
          disabled
          placeholder="Enter a number"
          style={{ width: "100%", padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}
        />
      )}

      {v.hint && <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)" }}>Hint: {v.hint}</p>}
    </div>
  );
}
