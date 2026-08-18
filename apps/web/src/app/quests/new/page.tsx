"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import { ApiError, createQuest } from "@/lib/api";

export default function NewQuestPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

    if (!title.trim()) {
      setErrors({ title: "Title is required." });
      return;
    }
    setErrors({});

    if (!accessToken) return;
    setSubmitting(true);
    try {
      const created = await createQuest(accessToken, { title, description: description.trim() || undefined });
      router.push(`/quests/${created.id}`);
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
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 24px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: "var(--fw-semibold)", marginBottom: 4 }}>
        Build a quest
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Give it a title, then chain activities and mastery goals into steps on the next screen.
      </p>

      {banner && (
        <p role="alert" data-testid="create-quest-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField label="Quest title" htmlFor="title" error={errors.title}>
          <Input id="title" name="title" value={title} onChange={setTitle} placeholder="Marine Biology Explorer" />
        </FormField>
        <FormField label="Description (optional)" htmlFor="description" error={errors.description}>
          <Input id="description" name="description" value={description} onChange={setDescription} placeholder="A short blurb learners will see" />
        </FormField>

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Creating…" : "Create quest"}
        </Button>
      </form>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        <Link href="/quests">Back to quests</Link>
      </p>
    </main>
  );
}
