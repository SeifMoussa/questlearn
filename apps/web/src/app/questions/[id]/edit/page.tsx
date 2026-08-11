"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  QuestionForm,
  QuestionFormValue,
  questionFormValueFrom,
  toQuestionPayload,
  validateQuestionForm,
} from "@/components/QuestionForm";
import { useAuth } from "@/lib/auth-context";
import { ApiError, QuestionPayload, getQuestion, updateQuestion } from "@/lib/api";

type LoadState = "loading" | "loaded" | "not-found" | "error";

export default function EditQuestionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const questionId = params.id;
  const { status, accessToken } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [value, setValue] = useState<QuestionFormValue | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;

    getQuestion(accessToken, questionId)
      .then((question) => {
        const payload: QuestionPayload = {
          type: question.currentVersion.type,
          prompt: question.currentVersion.prompt,
          points: question.currentVersion.points,
          hint: question.currentVersion.hint ?? undefined,
          explanation: question.currentVersion.explanation ?? undefined,
          options: question.currentVersion.options ?? undefined,
          correctAnswer: question.currentVersion.correctAnswer,
        };
        setValue(questionFormValueFrom(payload));
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 404) {
          setLoadState("not-found");
        } else {
          setLoadState("error");
        }
      });
  }, [status, accessToken, questionId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    if (!value) return;

    const clientErrors = validateQuestionForm(value);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});

    if (!accessToken) return;
    setSubmitting(true);
    try {
      await updateQuestion(accessToken, questionId, toQuestionPayload(value));
      router.push(`/questions/${questionId}`);
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

  if (status === "loading" || loadState === "loading") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p data-testid="edit-question-loading">Loading question…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return null;
  }

  if (loadState === "not-found") {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: "var(--fw-semibold)" }}>
          Question not found
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          This question doesn&apos;t exist, or isn&apos;t one of yours.
        </p>
        <Link href="/questions">Back to question bank</Link>
      </main>
    );
  }

  if (loadState === "error" || !value) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-ui)" }}>
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)" }}>
          Something went wrong.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "60px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Edit question
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Saving creates a new version — the previous version is kept.
      </p>

      {banner && (
        <p role="alert" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <QuestionForm value={value} onChange={setValue} errors={errors} onSubmit={onSubmit} submitting={submitting} submitLabel="Save changes" />

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        <Link href={`/questions/${questionId}`}>Back to question</Link>
      </p>
    </main>
  );
}
