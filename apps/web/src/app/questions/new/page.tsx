"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QuestionForm, emptyQuestionFormValue, toQuestionPayload, validateQuestionForm } from "@/components/QuestionForm";
import { useAuth } from "@/lib/auth-context";
import { ApiError, createQuestion } from "@/lib/api";

export default function NewQuestionPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [value, setValue] = useState(emptyQuestionFormValue());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);

    const clientErrors = validateQuestionForm(value);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});

    if (!accessToken) return;
    setSubmitting(true);
    try {
      const created = await createQuestion(accessToken, toQuestionPayload(value));
      router.push(`/questions/${created.id}`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.fieldErrors) {
        const fieldErrors: Record<string, string> = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          fieldErrors[field] = messages[0];
        }
        setErrors(fieldErrors);
      } else if (error instanceof ApiError) {
        setBanner(error.message);
      } else {
        setBanner("Something went wrong. Please try again.");
      }
    }
  }

  if (status === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Add a question
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Pick a question type, then fill in the answer key.
      </p>

      {banner && (
        <p role="alert" data-testid="create-question-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <QuestionForm value={value} onChange={setValue} errors={errors} onSubmit={onSubmit} submitting={submitting} submitLabel="Create question" />

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        <Link href="/questions">Back to question bank</Link>
      </p>
    </main>
  );
}
