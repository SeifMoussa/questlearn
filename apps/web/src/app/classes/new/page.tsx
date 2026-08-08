"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@questlearn/design-system";
import { FormField } from "@/components/FormField";
import { useAuth } from "@/lib/auth-context";
import { ApiError, createClass } from "@/lib/api";

export default function NewClassPage() {
  const router = useRouter();
  const { status, accessToken } = useAuth();
  const [name, setName] = useState("");
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

    if (!name.trim()) {
      setErrors({ name: "Class name is required." });
      return;
    }
    setErrors({});

    if (!accessToken) return;
    setSubmitting(true);
    try {
      const created = await createClass(accessToken, { name });
      router.push(`/classes/${created.id}`);
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
        Create a class
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        You&apos;ll get a join code you can share with students. Roster
        entries are added from the class page after it&apos;s created.
      </p>

      {banner && (
        <p role="alert" data-testid="create-class-error-banner" style={{ color: "var(--status-at-risk-fg, #b42318)", fontSize: 13, marginBottom: 16 }}>
          {banner}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate>
        <FormField label="Class name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" value={name} onChange={setName} placeholder="Period 3 Math" />
        </FormField>

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Creating…" : "Create class"}
        </Button>
      </form>

      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 18 }}>
        <Link href="/classes">Back to classes</Link>
      </p>
    </main>
  );
}
